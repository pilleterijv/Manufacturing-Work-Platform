// Deterministic exports from the approved SVG: no replacement/recreated logo artwork.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  sharp = require("sharp");
async function main() {
  const root = path.join(__dirname, "..", "public"),
    logo = await fs.readFile(path.join(root, "company-logo.svg")),
    src = logo.toString("base64");
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="white"/><image href="data:image/svg+xml;base64,${src}" x="64" y="128" width="384" height="256" preserveAspectRatio="xMidYMid meet"/></svg>`,
  );
  for (const [name, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable.png", 512],
    ["apple-touch-icon.png", 180],
  ])
    await sharp(svg).resize(size, size).png().toFile(path.join(root, name));
  console.log("App icons exported from public/company-logo.svg.");
}
main().catch(() => {
  console.error(
    "Unable to export company logo icons; check the approved SVG and image tooling.",
  );
  process.exitCode = 1;
});
