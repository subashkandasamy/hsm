import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // PDF generation (bills, summaries): keep react-pdf out of the bundle and ship
  // the embedded fonts with the server functions that render PDFs.
  serverExternalPackages: ['@react-pdf/renderer'],
  outputFileTracingIncludes: {
    '/billing/**': ['./src/lib/pdf/fonts/**'],
  },
  // Turbopack is default in Next.js 16; no extra flags needed
  experimental: {
    serverActions: {
      bodySizeLimit: '3mb',
    },
  },
}

export default nextConfig
