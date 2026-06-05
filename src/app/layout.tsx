import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hospital Management System',
  description: 'HMS — Internal hospital operations platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
