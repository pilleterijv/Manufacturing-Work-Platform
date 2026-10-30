const fs = require("node:fs"),
  path = require("node:path");
async function main() {
  const root = process.cwd(),
    standalone = path.join(root, ".next", "standalone");
  if (!fs.existsSync(path.join(standalone, "server.js")))
    throw Error("Run npm run build first");
  fs.cpSync(
    path.join(root, ".next", "static"),
    path.join(standalone, ".next", "static"),
    { recursive: true },
  );
  if (fs.existsSync("public"))
    fs.cpSync("public", path.join(standalone, "public"), { recursive: true });
  for (const name of fs.readdirSync(
    path.join(root, "node_modules/.prisma/client"),
  ))
    if (name.endsWith(".wasm"))
      fs.copyFileSync(
        path.join(root, "node_modules/.prisma/client", name),
        path.join(standalone, "node_modules/.prisma/client", name),
      );
  for (const name of fs.readdirSync(standalone))
    if (name === ".env" || name.startsWith(".env."))
      fs.rmSync(path.join(standalone, name), { force: true });
  fs.rmSync(path.join(standalone, "uploads"), { recursive: true, force: true });
  fs.mkdirSync(path.join(standalone, "tools"), { recursive: true });
  for (const name of ["setup", "create-admin"])
    await require("esbuild").build({
      entryPoints: [`scripts/${name}.ts`],
      outfile: path.join(standalone, "tools", `${name}.cjs`),
      bundle: true,
      platform: "node",
      target: "node22",
      format: "cjs",
      external: ["@prisma/client", "@prisma/adapter-pg", "pg", "next/*"],
      logLevel: "warning",
    });
  const runtime = path.join(root, ".floorwork", "runtime"),
    prior = path.join(root, ".floorwork", "previous-runtime");
  fs.mkdirSync(path.dirname(runtime), { recursive: true });
  if (fs.existsSync(prior))
    throw Error(
      "Previous runtime backup exists; preserve or inspect it before preparing another build",
    );
  if (fs.existsSync(runtime)) fs.renameSync(runtime, prior);
  try {
    fs.renameSync(standalone, runtime);
  } catch (e) {
    if (fs.existsSync(prior)) fs.renameSync(prior, runtime);
    throw e;
  }
  fs.rmSync(prior, { recursive: true, force: true });
  console.log("Portable production runtime prepared in .floorwork/runtime.");
}
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { prepareRuntime: main };
