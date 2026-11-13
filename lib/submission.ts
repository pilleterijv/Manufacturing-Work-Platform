import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { HttpError } from "./http-error";
function canonical(value: any): any {
  return Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .filter((k) => k !== "requestKey")
            .map((k) => [k, canonical(value[k])]),
        )
      : value;
}
export async function withSubmission<T extends { id: string }>(
  userId: string,
  kind: string,
  body: any,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const key = z.string().uuid().optional().parse(body.requestKey);
  // Existing integration clients may omit a key; the floor forms always supply one.
  if (!key) return db.$transaction(work);
  const id = kind + ":" + userId + ":" + key,
    digest = createHash("sha256")
      .update(JSON.stringify(canonical(body)))
      .digest("hex");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
    const old = await tx.submissionReceipt.findUnique({ where: { id } });
    if (old) {
      if (old.digest !== digest)
        throw new HttpError(
          409,
          "This submission was already saved with different entries. Refresh the saved record before continuing.",
        );
      return old.result as T;
    }
    const result = await work(tx);
    await tx.submissionReceipt.create({
      data: {
        id,
        userId,
        kind,
        digest,
        result: JSON.parse(JSON.stringify(result)),
      },
    });
    return result;
  });
}
