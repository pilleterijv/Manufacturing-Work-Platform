import { readBoundedResponseJson } from "./http-body";
import { effectiveGrants } from "./delegation-rules";
import { assertEquipmentAccess, type ScopedUser } from "./location-access";
import { db } from "./db";
import { z } from "zod";
export const maintainxMappingSchema = z.record(
  z.string().uuid(),
  z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
);
export const maintainxReady = () => !!process.env.MAINTAINX_API_KEY;
export async function maintainxMapping() {
  const s = await db.setting.findUnique({ where: { key: "maintainx-assets" } });
  return maintainxMappingSchema.parse(s?.value ?? {});
}
export function maintainxPayload(
  d: {
    id: string;
    title: string;
    description: string;
    priority: string;
    equipmentSnapshot: unknown;
    media: unknown;
  },
  assetId: number,
) {
  const e = d.equipmentSnapshot as any;
  return {
    title: d.title,
    assetId,
    description: `Floorwork defect ${d.id}\nPriority: ${d.priority}\n${[e.plant, e.department, e.area, e.name].filter(Boolean).join(" / ")}\n\n${d.description}\n\n${Array.isArray(d.media) ? d.media.length : 0} photo/video attachments remain in Floorwork (authorized sign-in required).`,
    externalData: { floorworkDefectId: d.id },
  };
}
// No automatic retry after an ambiguous response: a work order may already exist.
export async function submitMaintainx(
  id: string,
  actor: ScopedUser,
  request: typeof fetch = fetch,
) {
  if (!maintainxReady()) throw Error("MaintainX is not configured");
  const assets = await maintainxMapping(),
    old = await db.defect.findUniqueOrThrow({ where: { id } }),
    asset = assets[old.equipmentId];
  if (!asset) throw Error("Ask Admin to map this machine to a MaintainX asset");
  const claimed = await db.$transaction(async (tx) => {
    await assertEquipmentAccess(actor, old.equipmentId, tx);
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: actor.id } }),
      policy = await tx.policy.findUnique({ where: { role: fresh.role } }),
      permissions = effectiveGrants(
        fresh.role,
        policy?.grants,
        fresh.extraGrants,
        fresh.adminPrivileges,
      );
    if (fresh.role !== "Admin" && !permissions.includes("defects"))
      throw Error("Defect permission was revoked");
    return tx.defect.updateMany({
      where: {
        id,
        maintainxStatus: "Not submitted",
        status: "Open",
        ...(!(fresh.role === "Admin" || permissions.includes("manage"))
          ? { OR: [{ reportedBy: fresh.id }, { assigneeId: fresh.id }] }
          : {}),
      },
      data: {
        maintainxStatus: "Sending",
        submissionAt: new Date(),
        submissionError: null,
      },
    });
  });
  if (!claimed.count)
    throw Error("Already submitted or awaiting reconciliation; reload");
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${process.env.MAINTAINX_API_KEY}`,
      "Content-Type": "application/json",
    };
    if (process.env.MAINTAINX_ORGANIZATION_ID)
      headers["x-organization-id"] = z
        .string()
        .regex(/^\d+$/)
        .parse(process.env.MAINTAINX_ORGANIZATION_ID);
    const response = await request(
      "https://api.getmaintainx.com/v1/workorders",
      {
        method: "POST",
        headers,
        body: JSON.stringify(maintainxPayload(old, asset)),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      },
    );
    if (!response.ok) throw Error("Work order submission was not confirmed");
    const body = await readBoundedResponseJson(response, 256 * 1024),
      orderId = z
        .number()
        .int()
        .positive()
        .safeParse(body.workOrder?.id ?? body.id);
    if (!orderId.success)
      throw Error("Work order response could not be verified");
    await db.defect.update({
      where: { id },
      data: {
        maintainxStatus: "Submitted",
        maintainxId: String(orderId.data),
        submissionError: null,
      },
    });
    return orderId.data;
  } catch {
    await db.defect.updateMany({
      where: { id, maintainxStatus: "Sending" },
      data: {
        maintainxStatus: "Review required",
        submissionError:
          "Submission could not be confirmed. Check MaintainX for the Floorwork defect ID before retrying.",
      },
    });
    throw Error(
      "Check MaintainX before retrying; submission could not be confirmed",
    );
  }
}
