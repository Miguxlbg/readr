import type { Metadata } from 'next'
import { Atkinson_Hyperlegible, Bitter, Inter, Lora, Merriweather, Public_Sans, Source_Serif_4 } from 'next/font/google'
import './globals.css'
import { ProfileProvider } from '@/components/auth/ProfileProvider'
import { LanguageProvider } from '@/components/ui/LanguageProvider'
import { AppThemeProvider } from '@/components/ui/AppThemeProvider'

const sourceSerif = Source_Serif_4({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--reader-font-source-serif' })
const lora = Lora({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--reader-font-lora' })
const bitter = Bitter({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--reader-font-bitter' })
const merriweather = Merriweather({ subsets: ['latin'], weight: ['400', '700'], variable: '--reader-font-merriweather' })
const atkinson = Atkinson_Hyperlegible({ subsets: ['latin'], weight: ['400', '700'], variable: '--reader-font-atkinson' })
const inter = Inter({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--reader-font-inter' })
const publicSans = Public_Sans({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--reader-font-public-sans' })
const readerFontVariables = [sourceSerif, lora, bitter, merriweather, atkinson, inter, publicSans].map((font) => font.variable).join(' ')

export const metadata: Metadata = {
  title: { default: 'Readr — sua leitura, do seu jeito', template: '%s | Readr' },
  description: 'Crie, organize e leia seus livros com uma experiência de página real.',
  applicationName: 'Readr',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={readerFontVariables}><AppThemeProvider><LanguageProvider><ProfileProvider>{children}</ProfileProvider></LanguageProvider></AppThemeProvider></body>
    </html>
  )
}
