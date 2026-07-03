import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Turbopack is default in Next.js 16; no extra flags needed
  experimental: {
    serverActions: {
      bodySizeLimit: '3mb',
    },
  },
}

export default nextConfig
