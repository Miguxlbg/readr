import type { ReaderFontId } from '@/lib/types'

export const READER_FONTS: Array<{ id: ReaderFontId; label: string; css: string; serif: boolean }> = [
  { id: 'source-serif', label: 'Source Serif 4', css: 'var(--reader-font-source-serif)', serif: true },
  { id: 'lora', label: 'Lora', css: 'var(--reader-font-lora)', serif: true },
  { id: 'bitter', label: 'Bitter', css: 'var(--reader-font-bitter)', serif: true },
  { id: 'merriweather', label: 'Merriweather', css: 'var(--reader-font-merriweather)', serif: true },
  { id: 'atkinson', label: 'Atkinson Hyperlegible', css: 'var(--reader-font-atkinson)', serif: false },
  { id: 'inter', label: 'Inter', css: 'var(--reader-font-inter)', serif: false },
  { id: 'public-sans', label: 'Public Sans', css: 'var(--reader-font-public-sans)', serif: false },
]

export function readerFontCss(id: ReaderFontId) {
  return READER_FONTS.find((font) => font.id === id)?.css || READER_FONTS[0].css
}
