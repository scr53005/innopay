import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@innopay/ui'],
  /* config options here */
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.innopay.lu', port: '', pathname: '/**' },
    ],
  },
};

export default nextConfig;
