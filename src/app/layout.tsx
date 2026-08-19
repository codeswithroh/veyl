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

const SITE_URL = 'https://veyl-tau.vercel.app'
const SITE_TITLE = 'Veyl: Private Trading Terminal for Starknet'
const SITE_DESCRIPTION =
  'Veyl is a trading and token launch terminal on Starknet. It uses the STRK20 privacy pool so trades and token launches cannot be traced back to your funding wallet. Veyl never holds your funds.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: '%s | Veyl',
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'Veyl',
    'Starknet',
    'STRK20',
    'private trading',
    'privacy pool',
    'token launch',
    'DeFi',
    'shielded transactions',
  ],
  applicationName: 'Veyl',
  authors: [{ name: 'Veyl' }],
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Veyl',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: '/media/trading-dashboard-transparent.png', width: 1582, height: 597, alt: 'Veyl trading dashboard' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/media/trading-dashboard-transparent.png'],
  },
}

// Structured data for search engines and AI agents: what Veyl is, and the
// FAQ content already on the landing page in a machine-readable form.
const structuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Veyl',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Is Veyl a launchpad?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. Veyl is a private trading terminal. Fair token launches are one feature built using the same privacy technology, not the main product.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which tokens can I trade on Veyl?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: "Any token that has liquidity on Starknet. Memecoins are the clearest early use case, but that is not a limit. Veyl adds a privacy layer on top of trading, it does not maintain its own fixed list of tokens.",
        },
      },
      {
        '@type': 'Question',
        name: 'Does Veyl custody user funds?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. Users shield and trade through their own connected wallet the entire time. Veyl never holds user assets.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is Veyl live on Starknet Mainnet?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: "Veyl's code (shield, unshield, private transfer, and the fair-launch contract) is built to run on the real STRK20 pool, on Starknet Mainnet or Sepolia. Veyl is currently testing on Sepolia before moving fully to Mainnet. The project's strk20.json file lists the current deployed contracts and live transactions.",
        },
      },
    ],
  },
]

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
      <body>
        {/* eslint-disable-next-line react/no-danger */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {children}
      </body>
    </html>
  )
}
