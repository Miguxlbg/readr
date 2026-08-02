import type { ReaderBlock, ReaderChapter } from '@/lib/types'

const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,blockquote,li,hr,img,div,section,article,main,figure'
const CONTAINER_TAGS = new Set(['BODY', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'FIGURE'])
const DIVIDER_PATTERN = /^(?:\*\s*){3,}$|^(?:•\s*){3,}$|^(?:—\s*){1,3}$|^(?:-\s*){3,}$/

export function normalizeReaderText(value: string, preserveBreaks = false) {
  const normalized = value.replace(/\r/g, '').replace(/[\t\f\v ]+/g, ' ')
  return preserveBreaks
    ? normalized.replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    : normalized.replace(/\s+/g, ' ').trim()
}

export function readerBlockText(block: ReaderBlock) {
  return 'text' in block ? block.text : ''
}

export function readerBlocksText(blocks: ReaderBlock[]) {
  return blocks.map(readerBlockText).filter(Boolean).join('\n\n')
}

export function countReaderWords(blocks: ReaderBlock[]) {
  return readerBlocksText(blocks).split(/\s+/).filter(Boolean).length
}

function textWithBreaks(element: Element) {
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  return normalizeReaderText(clone.textContent || '', true)
}

function directText(element: Element) {
  return normalizeReaderText(
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || '')
      .join(' '),
  )
}

function looksLikeDivider(element: Element, text: string) {
  if (element.tagName === 'HR' || DIVIDER_PATTERN.test(text)) return true
  const style = (element.getAttribute('style') || '').toLowerCase()
  const align = (element.getAttribute('align') || '').toLowerCase()
  return (align === 'center' || style.includes('text-align: center')) && DIVIDER_PATTERN.test(text)
}

export async function htmlDocumentToBlocks(
  document: Document,
  resolveImage?: (src: string) => Promise<string | null>,
): Promise<ReaderBlock[]> {
  document.querySelectorAll('script,style,noscript,nav').forEach((node) => node.remove())
  const blocks: ReaderBlock[] = []
  const elements = Array.from(document.querySelectorAll(BLOCK_SELECTOR))

  for (const element of elements) {
    const tag = element.tagName.toUpperCase()
    if (tag === 'IMG') {
      const raw = element.getAttribute('src') || ''
      const src = raw && resolveImage ? await resolveImage(raw) : raw
      if (src) blocks.push({ type: 'image', src, alt: element.getAttribute('alt') || undefined })
      continue
    }
    if (tag === 'HR') {
      blocks.push({ type: 'divider' })
      continue
    }
    if (/^H[1-6]$/.test(tag)) {
      const text = textWithBreaks(element)
      if (text) blocks.push({ type: 'heading', level: Number(tag[1]), text })
      continue
    }
    if (tag === 'BLOCKQUOTE') {
      const text = textWithBreaks(element)
      if (text) blocks.push({ type: 'blockquote', text, preserveBreaks: text.includes('\n') })
      continue
    }
    if (tag === 'LI') {
      if (element.closest('blockquote')) continue
      const text = textWithBreaks(element)
      if (text) blocks.push({ type: 'list-item', text, ordered: element.parentElement?.tagName.toUpperCase() === 'OL' })
      continue
    }
    if (tag === 'P') {
      if (element.closest('blockquote,li')) continue
      const text = textWithBreaks(element)
      if (looksLikeDivider(element, text)) blocks.push({ type: 'divider' })
      else if (text) blocks.push({ type: 'paragraph', text, preserveBreaks: text.includes('\n') })
      continue
    }
    if (CONTAINER_TAGS.has(tag)) {
      if (element.querySelector('h1,h2,h3,h4,h5,h6,p,blockquote,li,hr,img')) continue
      const text = directText(element)
      if (!text) continue
      if (looksLikeDivider(element, text)) blocks.push({ type: 'divider' })
      else blocks.push({ type: 'paragraph', text })
    }
  }

  return blocks.filter((block, index) => {
    const previous = blocks[index - 1]
    if (!previous) return true
    if (block.type === 'divider' && previous.type === 'divider') return false
    return !('text' in block && 'text' in previous && block.type === previous.type && block.text === previous.text)
  })
}

export function legacyHtmlToChapter(html: string, index: number, fallbackTitle?: string): ReaderChapter {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const heading = document.querySelector('h1,h2,h3,h4,h5,h6')?.textContent?.trim()
  const paragraphs = Array.from(document.querySelectorAll('p')).map((node) => textWithBreaks(node)).filter(Boolean)
  const plain = normalizeReaderText(document.body?.textContent || '')
  const blocks: ReaderBlock[] = paragraphs.length
    ? paragraphs.map((text, paragraphIndex) => ({ type: 'paragraph', text, preserveBreaks: text.includes('\n'), dropCap: paragraphIndex === 0 }))
    : plain ? [{ type: 'paragraph', text: plain, dropCap: true }] : []
  const title = heading || fallbackTitle || `Capítulo ${index + 1}`
  return { id: `legacy-${index}`, title, blocks }
}
