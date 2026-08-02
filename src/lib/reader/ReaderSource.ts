import type { Book, Chapter, ReaderBlock, ReaderChapter, ReaderPage } from '@/lib/types'
import { countReaderWords, legacyHtmlToChapter, readerBlocksText } from './blocks'

export interface ReaderSource {
  book: Book
  load(): Promise<ReaderChapter[]>
}

export function readerPageText(page: Pick<ReaderPage, 'blocks'>) {
  return readerBlocksText(page.blocks)
}

function splitTextBlock(block: Extract<ReaderBlock, { text: string }>, maximum: number) {
  const words = block.text.split(/\s+/).filter(Boolean)
  if (words.length <= maximum) return [block]
  const fragments: typeof block[] = []
  for (let index = 0; index < words.length; index += maximum) {
    fragments.push({
      ...block,
      text: words.slice(index, index + maximum).join(' '),
      ...('dropCap' in block ? { dropCap: Boolean(block.dropCap && index === 0) } : {}),
    })
  }
  return fragments
}

export function repaginateReaderContent(source: ReaderChapter[], wordsPerPage: number): ReaderPage[] {
  const capacity = Math.max(55, Math.round(wordsPerPage))
  const result: ReaderPage[] = []
  let globalAnchor = 0

  source.forEach((chapter) => {
    let pageBlocks: ReaderBlock[] = []
    let pageWords = 0
    let pageAnchor = globalAnchor
    let firstPage = true
    const flush = () => {
      if (!pageBlocks.length) return
      result.push({
        chapterTitle: chapter.title,
        pageNumber: result.length + 1,
        anchor: pageAnchor,
        blocks: pageBlocks,
        isFirstPageOfChapter: firstPage,
      })
      firstPage = false
      pageBlocks = []
      pageWords = 0
      pageAnchor = globalAnchor
    }

    chapter.blocks.forEach((originalBlock, blockIndex) => {
      const block: ReaderBlock = originalBlock.type === 'paragraph'
        ? { ...originalBlock, dropCap: originalBlock.dropCap ?? blockIndex === chapter.blocks.findIndex((item) => item.type === 'paragraph') }
        : originalBlock
      const wordCount = countReaderWords([block])
      if (block.type === 'image') {
        if (pageBlocks.length) flush()
        pageBlocks.push(block)
        flush()
        return
      }
      if (block.type === 'divider') {
        if (pageWords > capacity * 0.82) flush()
        pageBlocks.push(block)
        return
      }
      if (block.type === 'heading' && pageBlocks.length && pageWords > capacity * 0.3) flush()
      const available = Math.max(28, capacity - pageWords)
      const fragments = 'text' in block ? splitTextBlock(block, Math.max(55, available)) : [block]
      fragments.forEach((fragment, fragmentIndex) => {
        const fragmentWords = countReaderWords([fragment])
        if (pageBlocks.length && pageWords + fragmentWords > capacity) flush()
        if (!pageBlocks.length) pageAnchor = globalAnchor
        pageBlocks.push(fragment)
        pageWords += fragmentWords
        globalAnchor += fragmentWords
        if (fragmentIndex < fragments.length - 1) flush()
      })
    })
    flush()
  })

  return result.length ? result : [{
    chapterTitle: '',
    pageNumber: 1,
    anchor: 0,
    blocks: [{ type: 'paragraph', text: 'Este livro ainda está em branco.' }],
    isFirstPageOfChapter: true,
  }]
}

export class CreatedBookSource implements ReaderSource {
  constructor(public book: Book, private chapters: Chapter[]) {}

  async load() {
    return [...this.chapters]
      .sort((a, b) => a.order_index - b.order_index)
      .map((chapter, index) => legacyHtmlToChapter(chapter.content, index, chapter.title || `Capítulo ${index + 1}`))
  }
}

function isReaderChapter(value: string | ReaderChapter): value is ReaderChapter {
  return typeof value === 'object' && value !== null && Array.isArray(value.blocks)
}

export class ImportedBookSource implements ReaderSource {
  constructor(public book: Book) {}

  async load() {
    return (this.book.content || []).map((content, index) => isReaderChapter(content)
      ? {
          ...content,
          id: content.id || `imported-${index}`,
          title: content.title || `Capítulo ${index + 1}`,
          blocks: content.blocks || [],
        }
      : legacyHtmlToChapter(content, index),
    )
  }
}
