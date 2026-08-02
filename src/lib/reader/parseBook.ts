'use client'

import JSZip from 'jszip'
import mammoth from 'mammoth'
import type { BookFormat, ReaderBlock, ReaderChapter } from '@/lib/types'
import { htmlDocumentToBlocks, normalizeReaderText, readerBlocksText } from './blocks'

export interface ParsedBook {
  title: string
  author: string
  pages: ReaderChapter[]
  format: Exclude<BookFormat, 'readr'>
  description?: string
  language?: string
  publisher?: string
  publicationYear?: number | null
  coverBlob?: Blob | null
  coverExtension?: string
}

function extensionOf(file: File): Exclude<BookFormat, 'readr'> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension !== 'epub' && extension !== 'pdf' && extension !== 'docx') {
    throw new Error('Formato não suportado. Envie um arquivo EPUB, PDF ou DOCX.')
  }
  return extension
}

function dirname(path: string) {
  const clean = path.split('#')[0]
  return clean.includes('/') ? clean.slice(0, clean.lastIndexOf('/') + 1) : ''
}

function normalizePath(path: string) {
  const result: string[] = []
  decodeURIComponent(path).split('/').forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') result.pop()
    else result.push(part)
  })
  return result.join('/')
}

function resolvePath(baseFile: string, relative: string) {
  if (/^(?:data:|https?:|blob:)/i.test(relative)) return relative
  return normalizePath(`${dirname(baseFile)}${relative.split('#')[0]}`)
}

function mimeFor(path: string) {
  const extension = path.split('.').pop()?.toLowerCase()
  return extension === 'png' ? 'image/png'
    : extension === 'gif' ? 'image/gif'
      : extension === 'svg' ? 'image/svg+xml'
        : extension === 'webp' ? 'image/webp'
          : 'image/jpeg'
}

function bytesToDataUrl(bytes: Uint8Array, mime: string) {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

function chapterTitle(blocks: ReaderBlock[], fallback: string) {
  const heading = blocks.find((block) => block.type === 'heading')
  return heading && 'text' in heading ? heading.text : fallback
}

async function parseDocx(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const NodeBuffer = (globalThis as any).Buffer
  const input = NodeBuffer ? { buffer: NodeBuffer.from(arrayBuffer) } : { arrayBuffer }
  const result = await mammoth.convertToHtml(
    input,
    {
      convertImage: mammoth.images.imgElement(async (image) => ({
        src: `data:${image.contentType};base64,${await image.read('base64')}`,
      })),
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
      ],
    },
  )
  const document = new DOMParser().parseFromString(result.value, 'text/html')
  const blocks = await htmlDocumentToBlocks(document)
  const groups: ReaderChapter[] = []
  let current: ReaderChapter = { id: 'docx-1', title: file.name.replace(/\.[^.]+$/, ''), blocks: [] }
  for (const block of blocks) {
    if (block.type === 'heading' && block.level <= 2 && current.blocks.length) {
      groups.push(current)
      current = { id: `docx-${groups.length + 1}`, title: block.text, blocks: [block] }
    } else {
      current.blocks.push(block)
      if (block.type === 'heading' && current.blocks.length === 1) current.title = block.text
    }
  }
  if (current.blocks.length) groups.push(current)
  return groups
}

type PdfLine = { text: string; size: number; y: number; height: number; ended: boolean }

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function pdfItemsToLines(items: any[]): PdfLine[] {
  const lines: PdfLine[] = []
  let current: PdfLine | null = null
  for (const item of items) {
    if (!item || typeof item.str !== 'string') continue
    const y = Number(item.transform?.[5] || 0)
    const size = Math.abs(Number(item.transform?.[3] || item.height || 0)) || 10
    const height = Number(item.height || size)
    const changedLine = current && Math.abs(current.y - y) > Math.max(2, Math.min(current.height, height) * 0.45)
    if (!current || changedLine) {
      if (current?.text.trim()) lines.push({ ...current, text: current.text.trim() })
      current = { text: item.str, size, y, height, ended: Boolean(item.hasEOL) }
    } else {
      const spacer = current.text.endsWith('-') || /^\s/.test(item.str) ? '' : ' '
      current.text += `${spacer}${item.str}`
      current.size = Math.max(current.size, size)
      current.ended = current.ended || Boolean(item.hasEOL)
    }
    if (item.hasEOL && current) {
      if (current.text.trim()) lines.push({ ...current, text: current.text.trim() })
      current = null
    }
  }
  if (current?.text.trim()) lines.push({ ...current, text: current.text.trim() })
  return lines
}

function pdfLinesToBlocks(lines: PdfLine[], outlineTitle?: string): ReaderBlock[] {
  if (!lines.length) return []
  const sizes = lines.map((line) => line.size).filter(Boolean)
  const sizeMedian = median(sizes) || 10
  const bodySize = median(sizes.filter((size) => size <= sizeMedian)) || sizeMedian
  const lineHeight = median(lines.map((line) => line.height).filter(Boolean)) || bodySize
  const blocks: ReaderBlock[] = []
  let paragraph: string[] = []
  const flush = () => {
    const text = normalizeReaderText(paragraph.join(' '))
    if (text) blocks.push({ type: 'paragraph', text, dropCap: blocks.every((block) => block.type !== 'paragraph') })
    paragraph = []
  }
  if (outlineTitle && normalizeReaderText(lines[0]?.text || '') !== normalizeReaderText(outlineTitle)) {
    blocks.push({ type: 'heading', level: 1, text: outlineTitle })
  }
  lines.forEach((line, index) => {
    const previous = lines[index - 1]
    const next = lines[index + 1]
    const gapBefore = previous ? Math.abs(previous.y - line.y) : 0
    const gapAfter = next ? Math.abs(line.y - next.y) : 0
    const isolated = (!previous || gapBefore > lineHeight * 1.25) && (!next || gapAfter > lineHeight * 1.25)
    const heading = line.size >= bodySize * 1.28 && (isolated || line.text.length < 100)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', level: line.size >= bodySize * 1.65 ? 1 : 2, text: line.text })
      return
    }
    const divider = /^(?:\*\s*){3,}$|^(?:•\s*){3,}$|^—{1,3}$/.test(line.text)
    if (divider) {
      flush()
      blocks.push({ type: 'divider' })
      return
    }
    if (previous && gapBefore > lineHeight * 1.45) flush()
    paragraph.push(line.text)
    if (line.ended && (gapAfter > lineHeight * 1.25 || /[.!?…”’)]$/.test(line.text))) flush()
  })
  flush()
  return blocks
}

async function renderPdfPage(page: any, scale = 1.35) {
  const viewport = page.getViewport({ scale })
  const canvas = window.document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) return null
  await page.render({ canvasContext: context, viewport }).promise
  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
}

async function pdfOutlineByPage(document: any) {
  const map = new Map<number, string>()
  try {
    const outline = await document.getOutline()
    const walk = async (items: any[]) => {
      for (const item of items || []) {
        try {
          const destination = typeof item.dest === 'string' ? await document.getDestination(item.dest) : item.dest
          const reference = destination?.[0]
          if (reference) map.set((await document.getPageIndex(reference)) + 1, normalizeReaderText(item.title || ''))
        } catch {}
        if (item.items?.length) await walk(item.items)
      }
    }
    await walk(outline || [])
  } catch {}
  return map
}

async function parsePdf(file: File) {
  const runningInNode = Boolean((globalThis as any).process?.versions?.node)
  const pdfjs: any = runningInNode ? await import('pdfjs-dist/legacy/build/pdf.mjs') : await import('pdfjs-dist')
  if (!runningInNode) pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const chapters: ReaderChapter[] = []
  let coverBlob: Blob | null = null
  let title = ''
  let author = ''
  try {
    const metadata = await document.getMetadata()
    const info = metadata.info as Record<string, unknown>
    title = typeof info.Title === 'string' ? info.Title : ''
    author = typeof info.Author === 'string' ? info.Author : ''
  } catch {}
  const outline = await pdfOutlineByPage(document)

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const lines = pdfItemsToLines(content.items as any[])
    const blocks = pdfLinesToBlocks(lines, outline.get(pageNumber))
    try {
      const operators = await page.getOperatorList()
      const imageOps = operators.fnArray.filter((operation: number) => operation === pdfjs.OPS.paintImageXObject || operation === pdfjs.OPS.paintInlineImageXObject).length
      if (imageOps > 0 && readerBlocksText(blocks).split(/\s+/).length < 80) {
        const image = await renderPdfPage(page, 1.5)
        const src = image
          ? bytesToDataUrl(new Uint8Array(await image.arrayBuffer()), image.type)
          : `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#eee9df"/><path d="M210 290l70-85 55 55 42-48 65 78z" fill="#c9c1b3"/><circle cx="260" cy="150" r="28" fill="#c9c1b3"/><text x="320" y="355" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#756d61">Imagem incorporada na página ${pageNumber}</text></svg>`)}`
        blocks.unshift({ type: 'image', src, alt: `Ilustração da página ${pageNumber}` })
      }
    } catch {}
    if (pageNumber === 1) coverBlob = await renderPdfPage(page, 1.2)
    if (blocks.length) chapters.push({
      id: `pdf-page-${pageNumber}`,
      title: outline.get(pageNumber) || chapterTitle(blocks, `Página ${pageNumber}`),
      href: `page:${pageNumber}`,
      blocks,
    })
  }
  return { pages: chapters, title, author, coverBlob }
}

async function parseEpub(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const container = await zip.file('META-INF/container.xml')?.async('text')
  if (!container) throw new Error('EPUB inválido: container.xml não encontrado.')
  const containerXml = new DOMParser().parseFromString(container, 'application/xml')
  const packagePath = containerXml.querySelector('rootfile')?.getAttribute('full-path')
  if (!packagePath) throw new Error('EPUB inválido: pacote de conteúdo não encontrado.')
  const packageText = await zip.file(packagePath)?.async('text')
  if (!packageText) throw new Error('EPUB inválido: manifesto não encontrado.')

  const packageXml = new DOMParser().parseFromString(packageText, 'application/xml')
  const title = packageXml.querySelector('metadata > title, dc\\:title')?.textContent?.trim() || ''
  const author = packageXml.querySelector('metadata > creator, dc\\:creator')?.textContent?.trim() || ''
  const description = packageXml.querySelector('metadata > description, dc\\:description')?.textContent?.trim() || ''
  const language = packageXml.querySelector('metadata > language, dc\\:language')?.textContent?.trim() || ''
  const publisher = packageXml.querySelector('metadata > publisher, dc\\:publisher')?.textContent?.trim() || ''
  const date = packageXml.querySelector('metadata > date, dc\\:date')?.textContent?.trim() || ''
  const basePath = dirname(packagePath)
  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>()
  let coverHref = ''

  packageXml.querySelectorAll('manifest item').forEach((item) => {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) return
    const record = { href: normalizePath(`${basePath}${href.split('#')[0]}`), mediaType: item.getAttribute('media-type') || '', properties: item.getAttribute('properties') || '' }
    manifest.set(id, record)
    if (record.properties.includes('cover-image')) coverHref = record.href
  })
  if (!coverHref) {
    const coverId = packageXml.querySelector('metadata meta[name="cover"]')?.getAttribute('content') || ''
    coverHref = manifest.get(coverId)?.href || ''
  }

  const navigation = new Map<string, string>()
  const navItem = Array.from(manifest.values()).find((item) => item.properties.includes('nav'))
  if (navItem) {
    const navText = await zip.file(navItem.href)?.async('text')
    if (navText) {
      const navDocument = new DOMParser().parseFromString(navText, 'text/html')
      navDocument.querySelectorAll('nav a[href]').forEach((link) => {
        const href = resolvePath(navItem.href, link.getAttribute('href') || '')
        const label = normalizeReaderText(link.textContent || '')
        if (href && label) navigation.set(href, label)
      })
    }
  }
  const ncxItem = Array.from(manifest.values()).find((item) => item.mediaType === 'application/x-dtbncx+xml')
  if (ncxItem) {
    const ncxText = await zip.file(ncxItem.href)?.async('text')
    if (ncxText) {
      const ncx = new DOMParser().parseFromString(ncxText, 'application/xml')
      ncx.querySelectorAll('navPoint').forEach((point) => {
        const src = point.querySelector('content')?.getAttribute('src') || ''
        const label = normalizeReaderText(point.querySelector('navLabel text')?.textContent || '')
        if (src && label) navigation.set(resolvePath(ncxItem.href, src), label)
      })
    }
  }

  const imageCache = new Map<string, string>()
  const resolveImage = async (chapterHref: string, raw: string) => {
    const path = resolvePath(chapterHref, raw)
    if (imageCache.has(path)) return imageCache.get(path) || null
    const image = zip.file(path)
    if (!image) return null
    const bytes = await image.async('uint8array')
    const value = bytesToDataUrl(bytes, mimeFor(path))
    imageCache.set(path, value)
    return value
  }

  let coverBlob: Blob | null = null
  if (coverHref) {
    const cover = zip.file(coverHref)
    if (cover) {
      const bytes = await cover.async('uint8array')
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      coverBlob = new Blob([copy.buffer], { type: mimeFor(coverHref) })
    }
  }

  const chapters: ReaderChapter[] = []
  for (const [index, item] of Array.from(packageXml.querySelectorAll('spine itemref')).entries()) {
    const record = manifest.get(item.getAttribute('idref') || '')
    if (!record) continue
    const chapterHtml = await zip.file(record.href)?.async('text')
    if (!chapterHtml) continue
    const chapterDocument = new DOMParser().parseFromString(chapterHtml, 'text/html')
    const blocks = await htmlDocumentToBlocks(chapterDocument, (src) => resolveImage(record.href, src))
    if (!blocks.length) continue
    const navTitle = navigation.get(record.href) || Array.from(navigation.entries()).find(([href]) => href.split('#')[0] === record.href)?.[1]
    chapters.push({ id: item.getAttribute('idref') || `epub-${index + 1}`, href: record.href, title: navTitle || chapterTitle(blocks, `Capítulo ${chapters.length + 1}`), blocks })
  }

  return {
    title, author, description, language, publisher,
    publicationYear: Number(date.slice(0, 4)) || null,
    coverBlob,
    coverExtension: coverHref.split('.').pop()?.toLowerCase() || 'jpg',
    pages: chapters,
  }
}

export async function parseBookFile(file: File): Promise<ParsedBook> {
  const format = extensionOf(file)
  const fallbackTitle = file.name.replace(/\.[^.]+$/, '').trim()
  if (format === 'docx') {
    const pages = await parseDocx(file)
    if (!pages.length) throw new Error('O DOCX não contém conteúdo legível.')
    return { title: fallbackTitle, author: '', pages, format }
  }
  if (format === 'pdf') {
    const pdf = await parsePdf(file)
    if (!pdf.pages.length) throw new Error('O PDF não contém conteúdo legível.')
    return { title: pdf.title || fallbackTitle, author: pdf.author, pages: pdf.pages, format, coverBlob: pdf.coverBlob, coverExtension: 'jpg' }
  }
  const epub = await parseEpub(file)
  if (!epub.pages.length) throw new Error('O EPUB não contém capítulos legíveis.')
  return { ...epub, title: epub.title || fallbackTitle, format }
}
