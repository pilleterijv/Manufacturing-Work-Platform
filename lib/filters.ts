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
  const fields = ["name", "plant", "department", "area", "line"];
  return {
    ...(person ? { userId: person } : {}),
    ...(search
      ? {
          OR: [
            {
              user: {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { username: { contains: search, mode: "insensitive" } },
                ],
              },
            },
            { standard: { title: { contains: search, mode: "insensitive" } } },
            {
              standard: {
                equipment: {
                  OR: fields.map((k) => ({
                    [k]: { contains: search, mode: "insensitive" as const },
                  })),
                },
              },
            },
            {
              data: {
                path: ["title"],
                string_contains: search,
                mode: "insensitive",
              },
            },
            ...fields.flatMap((k) =>
              [
                ["equipmentSnapshot", k],
                ["snapshot", "equipment", k],
              ].map((path) => ({
                data: {
                  path,
                  string_contains: search,
                  mode: "insensitive" as const,
                },
              })),
            ),
          ],
        }
      : {}),
  };
}
