import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // monorepo root so standalone output includes workspace deps
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@catapreco/core", "@catapreco/db", "@catapreco/scraper"],
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
