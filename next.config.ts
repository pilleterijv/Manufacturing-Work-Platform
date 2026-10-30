import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: { "/*": ["./uploads/**/*", "./.env", "./.env.*"] },
  outputFileTracingIncludes: { "/*": ["./node_modules/.prisma/client/*.wasm"] },
  experimental: { cpus: 2 },
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "exceljs",
    "sharp",
  ],
};
export default config;
