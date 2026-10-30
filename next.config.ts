import type { NextConfig } from "next";
const config: NextConfig = {
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
