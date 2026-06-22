import nextConfig from "eslint-config-next";

const config = [
  {
    ignores: ["public/widget.js"],
  },
  ...nextConfig,
];

export default config;
