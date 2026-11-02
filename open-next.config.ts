import { defineCloudflareConfig } from "@opennextjs/cloudflare"

// Sem cache incremental: o Readr não usa ISR/SSG com dados — páginas client-rendered + API routes.
export default defineCloudflareConfig({})
