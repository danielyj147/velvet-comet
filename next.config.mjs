/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native / heavy node libs used inside route handlers must not be bundled.
  serverExternalPackages: ["better-sqlite3", "playwright-core"],
  // The shared libs import with ESM ".js" specifiers that point at ".ts" files
  // (so they also run under tsx/node). Teach webpack to resolve them.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
