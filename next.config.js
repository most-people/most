/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['127.0.0.1', '192.168.31.238'],
  trailingSlash: true,
}

export default nextConfig
