import type { Metadata } from 'next'
import { Inter, Space_Mono, Anton, Instrument_Serif } from 'next/font/google'
import './globals.css'

// Type pairing from .tastemaker/style-lock.md: Anton (condensed display) +
// Instrument Serif italic (single-word emphasis accent) + Inter (body/UI).
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
const anton = Anton({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
})
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['italic'],
  variable: '--font-script',
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
      className={`${inter.variable} ${spaceMono.variable} ${anton.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body>
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <filter id="veylGrain">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" result="noise" />
            <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 0" />
          </filter>
        </svg>
        <svg className="veyl-grain" aria-hidden>
          <rect width="100%" height="100%" filter="url(#veylGrain)" />
        </svg>
        {children}
      </body>
    </html>
  )
}
