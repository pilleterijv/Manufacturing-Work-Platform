import { db } from "./db";
import { equipmentIds, type ScopedUser } from "./location-access";
export async function linkedGuideMedia(
  u: ScopedUser,
  id: string,
  kind: "photo" | "video",
) {
  const ids = await equipmentIds(u);
  return db.content.findFirst({
    where: {
      active: true,
      kind: "guide",
      OR: [{ equipmentId: null }, { equipmentId: { in: ids } }],
      media: { array_contains: [{ id, kind }] },
    },
    select: { id: true },
  });
}
