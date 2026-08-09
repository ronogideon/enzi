/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Product image URLs come from the API and can be any host; skip the
  // optimizer's domain allow-list rather than maintaining it by hand.
  images: { unoptimized: true },
};
export default nextConfig;
