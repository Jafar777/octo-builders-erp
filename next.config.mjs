/** @type {import('next').NextConfig} */
const nextConfig = {
  // proxy.js runs on /api: without this, request bodies over 10 MB are cut short silently
  // (uploads go up to 200 MB, see lib/storage.js).
  experimental: { proxyClientMaxBodySize: "210mb" },
  images: {
    // New uploads are stored on our own server (/uploads/…), but pictures uploaded
    // before the move (profile photos, website images) still live on ImageKit.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ik.imagekit.io",
      },
    ],
  },
};

export default nextConfig;
