import { Readable } from "node:stream";
import { mkdir, writeFile, readFile, open } from "node:fs/promises";
import path from "node:path";
const root = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
async function container() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) return null;
  const { BlobServiceClient } = await import("@azure/storage-blob");
  return BlobServiceClient.fromConnectionString(conn).getContainerClient(
    process.env.AZURE_STORAGE_CONTAINER ?? "floorwork",
  );
}
export async function storePhoto(id: string, data: Buffer) {
  const cloud = await container();
  if (cloud) {
    await cloud
      .getBlockBlobClient(`${id}.webp`)
      .uploadData(data, { blobHTTPHeaders: { blobContentType: "image/webp" } });
  } else {
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, `${id}.webp`), data, {
      flag: "wx",
      mode: 0o600,
    });
  }
}
export async function readPhoto(id: string) {
  const cloud = await container();
  return cloud
    ? cloud.getBlockBlobClient(`${id}.webp`).downloadToBuffer()
    : readFile(path.join(root, `${id}.webp`));
}
export async function storeVideo(id: string, data: Buffer, mime: string) {
  const cloud = await container();
  if (cloud)
    await cloud
      .getBlockBlobClient(`${id}.video`)
      .uploadData(data, { blobHTTPHeaders: { blobContentType: mime } });
  else {
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, `${id}.video`), data, {
      flag: "wx",
      mode: 0o600,
    });
  }
}
export async function openVideo(id: string, signal?: AbortSignal) {
  const cloud = await container();
  if (cloud) {
    const blob = cloud.getBlockBlobClient(`${id}.video`);
    const info = await blob.getProperties({ abortSignal: signal });
    return {
      size: info.contentLength ?? 0,
      close: async () => {},
      stream: async (start: number, end: number) => {
        const result = await blob.download(start, end - start + 1, {
          abortSignal: signal,
        });
        if (!result.readableStreamBody) throw Error("Video stream unavailable");
        return Readable.toWeb(
          result.readableStreamBody as Readable,
        ) as ReadableStream<Uint8Array>;
      },
    };
  }
  const handle = await open(path.join(root, `${id}.video`), "r");
  try {
    const stat = await handle.stat();
    return {
      size: stat.size,
      close: () => handle.close(),
      stream: async (start: number, end: number) =>
        Readable.toWeb(
          handle.createReadStream({
            start,
            end,
            autoClose: true,
            highWaterMark: 64 * 1024,
            signal,
          }),
          {
            strategy: {
              highWaterMark: 64 * 1024,
              size: (chunk: Uint8Array) => chunk.byteLength,
            },
          },
        ) as ReadableStream<Uint8Array>,
    };
  } catch (e) {
    await handle.close();
    throw e;
  }
}
