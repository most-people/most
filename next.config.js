/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['127.0.0.1'],
  trailingSlash: true,
}

export default nextConfig
