import { HttpError } from "./http-error";
// Bound the bytes actually received, including bodies with missing/false lengths.
// Cancellation releases the upstream reader and deadline even for slow clients.
export async function readBodyBytes(
  message: Request | Response,
  max: number,
  timeoutMs = 15000,
) {
  const reader = message.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body");
  let timedOut = false,
    size = 0;
  const chunks: Uint8Array[] = [];
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, timeoutMs);
  try {
    const length = message.headers.get("content-length");
    if (length && /^\d+$/.test(length) && Number(length) > max)
      throw new HttpError(413, "Request is too large");
    while (true) {
      const { value, done } = await reader.read();
      if (timedOut) throw new HttpError(408, "Request body timed out");
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new HttpError(413, "Request is too large");
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function readBoundedResponseJson(
  response: Response,
  max = 100000,
) {
  return JSON.parse((await readBodyBytes(response, max)).toString("utf8"));
}
