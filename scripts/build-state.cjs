const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const roots = ["app", "lib", "prisma", "scripts", "public"];
const files = [
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "proxy.ts",
];
function sourceFingerprint(root) {
  const hash = crypto.createHash("sha256");
  hash.update(
    JSON.stringify({
      node: process.versions.node.split(".")[0],
      platform: process.platform,
      arch: process.arch,
    }),
  );
  const add = (relative) => {
    const full = path.join(root, relative),
      stat = fs.lstatSync(full);
    if (stat.isSymbolicLink())
      throw Error("Build input symlinks require a manual build");
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(full).sort())
        add(path.join(relative, name));
    } else if (stat.isFile()) {
      hash.update(relative.replaceAll(path.sep, "/"));
      hash.update("\0");
      hash.update(fs.readFileSync(full));
    }
  };
  for (const name of [...roots, ...files])
    if (fs.existsSync(path.join(root, name))) add(name);
  return hash.digest("hex");
}
function cachedBuild(root, fingerprint) {
  try {
    return (
      JSON.parse(
        fs.readFileSync(path.join(root, ".floorwork", "build.json"), "utf8"),
      ).fingerprint === fingerprint &&
      [
        "server.js",
        ".next/BUILD_ID",
        "tools/setup.cjs",
        "tools/create-admin.cjs",
        "node_modules/.prisma/client/query_compiler_bg.wasm",
      ].every((file) =>
        fs.existsSync(path.join(root, ".floorwork", "runtime", file)),
      )
    );
  } catch {
    return false;
  }
}
module.exports = { sourceFingerprint, cachedBuild };
