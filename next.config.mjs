/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  experimental: {
    // Import only the drei helpers we use instead of its whole barrel file.
    optimizePackageImports: ["@react-three/drei"],
  },
  async headers() {
    return [
      {
        // Texture URLs are versioned (?v=<hash>, see src/config/book.js), so they
        // can be cached for a year and still update the moment artwork changes.
        source: "/textures/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
