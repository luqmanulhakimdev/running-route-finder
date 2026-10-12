import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig: NextConfig = isGitHubPages
  ? {
      output: 'export',
      basePath: '/running-route-finder',
      trailingSlash: true,
      pageExtensions: ['static.tsx'],
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
