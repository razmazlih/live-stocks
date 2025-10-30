/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  turbopack: {},
};

module.exports = nextConfig;
