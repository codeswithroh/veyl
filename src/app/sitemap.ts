import type { MetadataRoute } from 'next'

const SITE_URL = 'https://veyl-tau.vercel.app'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/dashboard`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ]
}
