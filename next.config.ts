import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read from SQLite on every request → classic dynamic rendering, no Cache Components.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "assets.onlinesoccermanager.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
