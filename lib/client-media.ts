"use client";
const extensions: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};
export function mediaMime(file: File) {
  const mime = extensions[file.name.split(".").at(-1)?.toLowerCase() ?? ""];
  if (file.type.startsWith("image/") || file.type.startsWith("video/"))
    return file.type;
  if (mime) return mime;
  throw Error("Choose JPEG, PNG, WebP, MP4, MOV or WebM");
}
export async function readMediaFile(file: File) {
  const mime = mediaMime(file),
    limit = mime.startsWith("video/") ? 32 : 8;
  if (file.size > limit * 1024 * 1024)
    throw Error(`File must be under ${limit} MB`);
  const value = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error("Could not read this file"));
    r.readAsDataURL(file);
  });
  return `data:${mime};base64,${value.split(",")[1]}`;
}
