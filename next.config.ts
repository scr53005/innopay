import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  images: {
    domains: ['cdn.innopay.lu'],  // For your custom domain
  },
};

export default nextConfig;
