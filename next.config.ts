import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  turbopack: { root: path.resolve(__dirname) },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'supabasekong-dfpiopwrqgdf8iods10d4546.187.127.140.202.sslip.io',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
