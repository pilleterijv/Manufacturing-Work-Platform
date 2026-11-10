import { db } from "@/lib/db";
import {
  requireUser,
  grants,
  jsonBody,
  failure,
  HttpError,
} from "@/lib/security";
import { adminPrivileges } from "@/lib/capabilities";
import {
  dashboardPreferences,
  dashboardPreferencesSchema,
} from "@/lib/dashboard-preferences";
import { allowedSections } from "@/lib/navigation";
export async function GET() {
  try {
    const u = await requireUser();
    return Response.json({
      preferences: dashboardPreferences(u.dashboardPreferences),
      canDepartment: ["Admin", "Manager", "DL/TL"].includes(u.role),
      sections: allowedSections({
        ...u,
        grants: await grants(u),
        adminPrivileges: await adminPrivileges(u),
      }),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(),
      b = await jsonBody(req),
      preferences = dashboardPreferencesSchema.parse(b.preferences),
      sections = allowedSections({
        ...u,
        grants: await grants(u),
        adminPrivileges: await adminPrivileges(u),
      });
    if (!sections.includes(preferences.home))
      throw new HttpError(403, "Choose a section you have permission to open");
    if (
      preferences.defaultScope === "department" &&
      !["Admin", "Manager", "DL/TL"].includes(u.role)
    )
      throw new HttpError(
        403,
        "Department dashboards are for managers and DL/TLs",
      );
    await db.user.update({
      where: { id: u.id },
      data: { dashboardPreferences: preferences },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
