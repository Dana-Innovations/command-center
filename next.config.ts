import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "brand.sonance.com" },
    ],
  },
};

export default nextConfig;
