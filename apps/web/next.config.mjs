import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optional separate build folder so a build or second server never shares .next with a running
  // dev server (sharing it corrupts route manifests).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Emit a self-contained server bundle for the Docker image.
  output: "standalone",
  // Trace workspace packages (packages/*) into the standalone bundle.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  experimental: {
    optimizePackageImports: ["lucide-react"],
    externalDir: true
  }
};

export default nextConfig;
