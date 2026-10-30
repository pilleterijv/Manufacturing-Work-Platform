import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { BlobServiceClient } from "@azure/storage-blob";
const root = path.join(process.cwd(), "uploads");
function container() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  return conn
    ? BlobServiceClient.fromConnectionString(conn).getContainerClient(
        process.env.AZURE_STORAGE_CONTAINER ?? "floorwork",
      )
    : null;
}
export async function storePhoto(id: string, data: Buffer) {
  const cloud = container();
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
  const cloud = container();
  return cloud
    ? cloud.getBlockBlobClient(`${id}.webp`).downloadToBuffer()
    : readFile(path.join(root, `${id}.webp`));
}
