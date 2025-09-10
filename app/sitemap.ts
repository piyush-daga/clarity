import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || '';
  const now = new Date().toISOString();
  const urls: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/settings`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];
  return urls;
}

