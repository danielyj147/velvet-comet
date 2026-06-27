/** @type {import('next').NextConfig} */
const nextConfig = {
  // The searchtrace lib imports with ESM ".js" specifiers that point at ".ts" files
  // (so it also runs under tsx/node). Teach webpack to resolve them.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
