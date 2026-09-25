import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "0.0.0.0", "*.trycloudflare.com"],
};

export default nextConfig;
