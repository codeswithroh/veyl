import type { Metadata } from 'next'
import { Inter, Space_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

// Type pairing from .tastemaker/style-lock.md (ember/vortex direction):
// Plus Jakarta Sans (bold display) + Inter (body/UI) + Space Mono (addresses/hashes).
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono-ui',
  display: 'swap',
})
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Veyl — Private Launch & Trading Terminal on Starknet',
  description: 'Trade and launch tokens on Starknet without linking your identity to your positions, built on the STRK20 privacy pool.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceMono.variable} ${jakarta.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  )
}
