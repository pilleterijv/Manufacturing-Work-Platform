import { z } from "zod";
import { Prisma } from "@prisma/client";
export const readFilters = (url: string) => {
  const p = new URL(url).searchParams;
  return {
    person: z
      .string()
      .uuid()
      .optional()
      .parse(p.get("person") || undefined),
    search: z
      .string()
      .trim()
      .max(150)
      .parse(p.get("search") ?? ""),
  };
};
export const textFilter = (value: string, query: string) =>
  !query || value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
export function recordFilters(
  person: string | undefined,
  search: string,
): Prisma.RecordWhereInput {
  return {
    ...(person ? { userId: person } : {}),
    ...(search
      ? {
          OR: [
            { user: { name: { contains: search, mode: "insensitive" } } },
            { standard: { title: { contains: search, mode: "insensitive" } } },
            { data: { path: ["title"], string_contains: search } },
          ],
        }
      : {}),
  };
}
