const fs = require("node:fs"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
process.chdir(path.join(__dirname, ".."));
fs.mkdirSync("dist", { recursive: true });
const file = path.resolve("dist/Floorwork-source.zip");
execFileSync(
  "git",
  [
    "archive",
    "--format=zip",
    "--prefix=Floorwork/",
    "--output=" + file,
    "HEAD",
  ],
  { stdio: "inherit" },
);
console.log(
  "Packaged committed revision " +
    execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim(),
);
console.log(
  `${file} (${fs.statSync(file).size} bytes). Local uncommitted changes are not included.`,
);
