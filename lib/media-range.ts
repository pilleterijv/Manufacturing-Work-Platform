// Single byte ranges only; reject malformed/unsatisfiable ranges before opening
// a body stream. Whole-file reads and suffix ranges share the same bounded path.
export function videoRange(range: string | null, size: number) {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  if (!range) return { start: 0, end: size - 1, partial: false };
  if (range.length > 100) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!m || (!m[1] && !m[2])) return null;
  const from = m[1] ? Number(m[1]) : null,
    to = m[2] ? Number(m[2]) : null;
  if (
    (from !== null && !Number.isSafeInteger(from)) ||
    (to !== null && !Number.isSafeInteger(to))
  )
    return null;
  if (from === null && (!to || to < 0)) return null;
  const start = from ?? Math.max(0, size - to!),
    end = from !== null && to !== null ? Math.min(size - 1, to) : size - 1;
  if (start < 0 || start >= size || end < start) return null;
  return { start, end, partial: true };
}
