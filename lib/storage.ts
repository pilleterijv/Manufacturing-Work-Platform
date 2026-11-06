import { mkdir, writeFile, readFile } from "node:fs/promises";
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
