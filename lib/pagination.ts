import { z } from "zod";
import { HttpError } from "./http-error";
const schema = z.object({ id: z.string().uuid(), at: z.iso.datetime() });
export function decodeCursor(value: string | null) {
  if (!value) return null;
  try {
    if (value.length > 256 || !/^[\w-]+$/.test(value)) throw Error();
    const row = schema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    return { id: row.id, at: new Date(row.at) };
  } catch {
    throw new HttpError(400, "Invalid history cursor");
  }
}
export function pageInfo<T extends { id: string }>(
  rows: T[],
  date: (row: T) => Date,
) {
  const row = rows.slice(0, 100).at(-1);
  return {
    hasMore: rows.length > 100,
    cursor: row
      ? Buffer.from(
          JSON.stringify({ id: row.id, at: date(row).toISOString() }),
        ).toString("base64url")
      : null,
  };
}
