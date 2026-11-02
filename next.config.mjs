/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  logging: {
    level: 'silent',
  },
}

export default nextConfig

// Integra bindings do Cloudflare no `next dev` (D1 local via miniflare).
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

initOpenNextCloudflareForDev()
