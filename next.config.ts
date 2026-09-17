import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // PDF generation (bills, summaries): keep react-pdf out of the bundle and ship
  // the embedded fonts with the server functions that render PDFs.
  serverExternalPackages: ['@react-pdf/renderer'],
  outputFileTracingIncludes: {
    // PDF routes read the embedded fonts from disk at runtime.
    '/billing/**': ['./src/lib/pdf/fonts/**'],
    '/print/**': ['./src/lib/pdf/fonts/**'],
    '/portal/print/**': ['./src/lib/pdf/fonts/**'],
    '/opd/**': ['./src/lib/pdf/fonts/**'],
  },
  // Turbopack is default in Next.js 16; no extra flags needed
  experimental: {
    serverActions: {
      bodySizeLimit: '3mb',
    },
  },
}

export default nextConfig
