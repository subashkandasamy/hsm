import type { Metadata, Viewport } from 'next'
import './globals.css'
import PwaInit from '@/components/pwa/PwaInit'

export const metadata: Metadata = {
  title: 'Uyirly',
  description: 'Uyirly — Hospital Management Platform',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Uyirly',
  },
}

export const viewport: Viewport = {
  themeColor: '#0D9488',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-full">
        <PwaInit />
        {children}
      </body>
    </html>
  )
}
