import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
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
