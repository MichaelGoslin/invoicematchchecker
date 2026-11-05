import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Uploads go through the /api/match route handler, not server actions.
  poweredByHeader: false,
};

export default nextConfig;
