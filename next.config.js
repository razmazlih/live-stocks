/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  webpack: (config) => {
    const warnings = config.ignoreWarnings ?? [];
    warnings.push(/Critical dependency: the request of a dependency is an expression/);
    config.ignoreWarnings = warnings;
    return config;
  },
};

module.exports = nextConfig;
