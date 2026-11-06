export async function* paged<T extends { id: string }>(
  load: (cursor: string | undefined) => Promise<T[]>,
) {
  let cursor: string | undefined;
  while (true) {
    const batch = await load(cursor);
    if (!batch.length) return;
    for (const row of batch) yield row;
    cursor = batch[batch.length - 1].id;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
