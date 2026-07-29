import type { Metadata, Viewport } from 'next'
import './globals.css'
import PwaInit from '@/components/pwa/PwaInit'

const SITE_URL = 'https://www.uyirly.com'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Uyirly — Hospital Management Software for India',
  description:
    'All-in-one hospital management software for Indian hospitals, nursing homes and clinics. OPD, IPD, pharmacy, lab, radiology, billing and insurance in one cloud platform. DPDP Act aligned, data stored in India, native mobile app. 30-day free trial.',
  applicationName: 'Uyirly',
  keywords: [
    'hospital management software',
    'hospital management system',
    'hospital management software India',
    'cloud hospital management software',
    'HMS software',
    'hospital information system',
    'OPD management software',
    'IPD management software',
    'hospital billing software India',
    'pharmacy management software',
    'clinic management software',
    'nursing home management software',
    'DPDP compliant hospital software',
    'hospital software India',
  ],
  authors: [{ name: 'Uyirly' }],
  creator: 'Uyirly',
  publisher: 'Uyirly',
  manifest: '/manifest.webmanifest',
  alternates: {
    canonical: '/',
  },
  verification: {
    other: {
      'msvalidate.01': 'CA45504C51AB078A7D49271EFE53E82B',
    },
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: SITE_URL,
    siteName: 'Uyirly',
    title: 'Uyirly — Hospital Management Software for India',
    description:
      'Run your entire hospital on one platform — OPD to discharge, lab to pharmacy, billing to insurance. Built for Indian hospitals. DPDP Act aligned. 30-day free trial.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Uyirly — Hospital Management Software for India',
    description:
      'One platform for OPD, IPD, pharmacy, lab, billing and insurance. Built for Indian hospitals. DPDP Act aligned. 30-day free trial.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
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
  // Allow pinch-zoom up to 5x — WCAG 1.4.4 / Lighthouse accessibility.
  // (Removed maximumScale:1 + userScalable:false which blocked zoom.)
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <PwaInit />
        {children}
      </body>
    </html>
  )
}
