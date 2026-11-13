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

// Sending the original Blob avoids the base64/JSON copies and 33% wire overhead.
export async function uploadVideo(file: File) {
  const mime = mediaMime(file);
  if (!["video/mp4", "video/webm", "video/quicktime"].includes(mime))
    throw Error("Choose MP4, MOV or WebM");
  if (file.size > 32 * 1024 * 1024) throw Error("Video must be under 32 MB");
  const response = await fetch("/api/guide-media", {
    method: "POST",
    headers: {
      "Content-Type": mime,
      "X-Floorwork-Origin": window.location.origin,
    },
    body: file,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? "Video upload failed");
  return data as { id: string };
}
