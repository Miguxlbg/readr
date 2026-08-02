'use client'

import FlipBook from 'react-pageflip'
import { useRouter, useSearchParams } from 'next/navigation'
import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle, ChevronLeft, ChevronRight, LoaderCircle, RotateCcw } from 'lucide-react'
import { CreatedBookSource, ImportedBookSource, readerPageText, repaginateReaderContent } from '@/lib/reader/ReaderSource'
import { createHighlight, getBookmarks, getCreatedBook, getCurrentProfile, getHighlights, getImportedBook, getReadingProgress, registerBookRead, toggleBookmark, updateReadingProgress } from '@/lib/data'
import { readerFontCss } from '@/lib/reader/fonts'
import type { Book, CreatedBook, HighlightColor, ReaderBlock, ReaderBookmark, ReaderChapter, ReaderHighlight, ReaderPage, UserProfile } from '@/lib/types'
import { useReaderStore } from '@/store/readerStore'
import { ReaderToolbar } from './ReaderToolbar'
import { SelectionToolbar, type ReaderSelection } from './SelectionToolbar'
import { ThemeSwitcher } from './ThemeSwitcher'

const HTMLFlipBook = FlipBook as any

function renderWords(text: string, startAnchor: number, query: string, highlights: ReaderHighlight[]) {
  let anchor = startAnchor
  const needle = query.trim().toLocaleLowerCase()
  return text.split(/(\s+)/).map((part, index) => {
    if (/^\s+$/.test(part)) return part
    const ownAnchor = anchor++
    const highlight = highlights.find((item) => ownAnchor >= Number(item.anchor_start) && ownAnchor <= Number(item.anchor_end))
    const matches = needle && part.toLocaleLowerCase().includes(needle)
    return <span
      key={`${ownAnchor}-${index}`}
      data-reader-anchor={ownAnchor}
      className={`${highlight ? `reader-highlight is-${highlight.color}` : ''} ${matches ? 'reader-search-match' : ''}`}
      title={highlight?.note || undefined}
    >{part}</span>
  })
}

function blockWordCount(block: ReaderBlock) {
  return 'text' in block ? block.text.split(/\s+/).filter(Boolean).length : 0
}

const Page = memo(forwardRef<HTMLDivElement, { page: ReaderPage; total: number; query: string; highlights: ReaderHighlight[] }>(({ page, total, query, highlights }, ref) => {
  const { theme, fontSize, fontFamily, margin, lineSpacing } = useReaderStore()
  if (page.isCover) return <article ref={ref} className={`reader-page reader-cover-page reader-theme-${theme}`}>
    {page.coverUrl ? <img src={page.coverUrl} alt={page.chapterTitle} /> : <div className="reader-cover-fallback"><strong>{page.chapterTitle}</strong></div>}
  </article>

  let anchor = page.anchor
  const hasHeading = page.blocks.some((block) => block.type === 'heading')
  return <article ref={ref} className={`reader-page reader-theme-${theme}`}>
    <div className="reader-page-inner" style={{ padding: `${margin}px` }}>
      <p className="reader-page-number reader-page-number-top">{page.pageNumber} / {total}</p>
      <section className="reader-copy" style={{ fontFamily: readerFontCss(fontFamily), fontSize, lineHeight: lineSpacing }}>
        {page.isFirstPageOfChapter && !hasHeading && page.chapterTitle && <h1 className="reader-chapter-heading">{page.chapterTitle}</h1>}
        {page.blocks.map((block, index) => {
          const start = anchor
          anchor += blockWordCount(block)
          if (block.type === 'heading') {
            const Tag = `h${Math.min(6, Math.max(1, block.level))}` as keyof JSX.IntrinsicElements
            return <Tag key={index} className={`reader-block-heading reader-heading-${block.level}`}>{renderWords(block.text, start, query, highlights)}</Tag>
          }
          if (block.type === 'paragraph') return <p key={index} className={`reader-block-paragraph ${block.dropCap ? 'dropcap' : ''} ${block.preserveBreaks ? 'preserve-breaks' : ''}`}>{renderWords(block.text, start, query, highlights)}</p>
          if (block.type === 'blockquote') return <blockquote key={index} className={block.preserveBreaks ? 'preserve-breaks' : ''}>{renderWords(block.text, start, query, highlights)}</blockquote>
          if (block.type === 'list-item') return <div key={index} className={`reader-list-item ${block.ordered ? 'is-ordered' : ''}`}><span aria-hidden="true">{block.ordered ? `${index + 1}.` : '•'}</span><p>{renderWords(block.text, start, query, highlights)}</p></div>
          if (block.type === 'divider') return <div key={index} className="reader-divider" role="separator"><span>•</span><span>•</span><span>•</span></div>
          return <figure key={index} className="reader-content-image"><img src={block.src} alt={block.alt || ''} loading="lazy" onError={(event) => { event.currentTarget.closest('figure')?.classList.add('is-missing') }} /><figcaption>{block.alt}</figcaption></figure>
        })}
      </section>
    </div>
  </article>
}))
Page.displayName = 'ReaderPage'

interface BookDimensions { width: number; height: number; portrait: boolean }
const safeRoute = (value: string | null, fallback: string) => value?.startsWith('/') && !value.startsWith('//') ? value : fallback

export function PageFlipReader({ bookId }: { bookId: string }) {
  const search = useSearchParams()
  const router = useRouter()
  const t = useTranslations('reader')
  const source = search.get('source') === 'created' ? 'created' : 'imported'
  const flipRef = useRef<any>(null)
  const stageRef = useRef<HTMLElement>(null)
  const shellRef = useRef<HTMLElement>(null)
  const persistErrorShown = useRef(false)
  const positionAnchorRef = useRef(0)
  const chromeTimerRef = useRef<number | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [sourceChapters, setSourceChapters] = useState<ReaderChapter[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([])
  const [highlights, setHighlights] = useState<ReaderHighlight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progressError, setProgressError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [searchMatch, setSearchMatch] = useState('')
  const [direction, setDirection] = useState<'next' | 'previous'>('next')
  const [dimensions, setDimensions] = useState<BookDimensions>({ width: 360, height: 540, portrait: true })
  const [chromeVisible, setChromeVisible] = useState(true)
  const [selection, setSelection] = useState<ReaderSelection | null>(null)
  const [copied, setCopied] = useState(false)
  const [dictionary, setDictionary] = useState('')
  const [curlSide, setCurlSide] = useState<'left' | 'right'>('right')
  const store = useReaderStore()
  const { currentPage, setPage, theme, brightness, pageGap, viewMode, animation, renderQuality, showChapters, showThumbnails, fontSize, margin, lineSpacing } = store

  const resetChromeTimer = useCallback((visible = true) => {
    if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current)
    if (visible) setChromeVisible(true)
    chromeTimerRef.current = window.setTimeout(() => setChromeVisible(false), 3000)
  }, [])
  useEffect(() => { resetChromeTimer(true); return () => { if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current) } }, [resetChromeTimer])

  const wordsPerPage = useMemo(() => {
    const areaFactor = (dimensions.width * dimensions.height) / (360 * 540)
    return Math.max(60, Math.round(170 * areaFactor * (18 / fontSize) * (38 / margin) * (1.68 / lineSpacing)))
  }, [dimensions, fontSize, margin, lineSpacing])
  const pages = useMemo(() => repaginateReaderContent(sourceChapters, wordsPerPage), [sourceChapters, wordsPerPage])
  const scrollWindowStart = Math.max(0, currentPage - 4)
  const scrollPages = pages.slice(scrollWindowStart, scrollWindowStart + 9)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const { width, height } = stage.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const landscape = width > height * 1.12
        const portrait = viewportWidth < 1200 && !landscape
        const horizontalMargin = viewportWidth < 768 ? 12 : viewportWidth < 1200 ? 28 : 72
        const safeWidth = Math.max(280, width - horizontalMargin)
        const safeHeight = Math.max(390, height - (chromeVisible ? 18 : 8))
        const widthByViewport = portrait ? safeWidth : safeWidth / 2
        const pageWidth = Math.max(270, Math.floor(Math.min(widthByViewport, safeHeight / 1.5)))
        const next = { width: pageWidth, height: Math.floor(pageWidth * 1.5), portrait }
        setDimensions((old) => old.width === next.width && old.height === next.height && old.portrait === next.portrait ? old : next)
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    window.addEventListener('orientationchange', update)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('orientationchange', update) }
  }, [chromeVisible])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError(''); setProgressError('')
      try {
        const currentProfile = await getCurrentProfile()
        if (!currentProfile) { router.replace(`/auth/login?next=${encodeURIComponent(`/book/${bookId}?source=${source}&from=${encodeURIComponent(search.get('from') || '/')}`)}`); return }
        const loadedBook = source === 'created' ? await getCreatedBook(bookId) : await getImportedBook(bookId)
        const loadedChapters = loadedBook ? await (source === 'created' ? new CreatedBookSource(loadedBook, (loadedBook as CreatedBook).chapters || []) : new ImportedBookSource(loadedBook)).load() : []
        if (!loadedBook || !loadedChapters.length) throw new Error('Livro não encontrado ou sem conteúdo legível.')
        await registerBookRead(bookId, source)
        const [progress, savedBookmarks, savedHighlights] = await Promise.all([
          getReadingProgress(currentProfile.id, loadedBook.id, loadedBook.source),
          getBookmarks(currentProfile.id, loadedBook.id, loadedBook.source),
          getHighlights(currentProfile.id, loadedBook.id, loadedBook.source).catch(() => []),
        ])
        if (!active) return
        setProfile(currentProfile); setBook(loadedBook); setSourceChapters(loadedChapters); setBookmarks(savedBookmarks as ReaderBookmark[]); setHighlights(savedHighlights)
        const initialAnchor = Number(progress?.anchor_offset || 0)
        const initialPages = repaginateReaderContent(loadedChapters, wordsPerPage)
        const page = initialAnchor ? Math.max(0, initialPages.findLastIndex((item) => item.anchor <= initialAnchor)) : Math.min(progress?.current_page || 0, initialPages.length - 1)
        positionAnchorRef.current = initialPages[page]?.anchor || initialAnchor
        setPage(page)
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o leitor.') }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [bookId, source, reloadKey, router])

  useEffect(() => {
    if (!pages.length) return
    const anchoredPage = Math.max(0, pages.findLastIndex((item) => item.anchor <= positionAnchorRef.current))
    if (anchoredPage !== currentPage) setPage(anchoredPage)
  }, [wordsPerPage, pages, currentPage, setPage])

  useEffect(() => {
    if (!profile || !book || !pages.length) return
    const timer = window.setTimeout(async () => {
      try {
        await updateReadingProgress({ user_id: profile.id, book_id: book.id, book_source: book.source, current_page: currentPage, anchor_offset: pages[currentPage]?.anchor || 0, percent: Math.round(((currentPage + 1) / pages.length) * 100) })
        persistErrorShown.current = false; setProgressError('')
      } catch (cause) { if (!persistErrorShown.current) { persistErrorShown.current = true; setProgressError(cause instanceof Error ? cause.message : t('notSaved')) } }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [currentPage, profile, book, pages, t])

  const goTo = useCallback((page: number) => {
    const target = Math.max(0, Math.min(page, pages.length - 1))
    positionAnchorRef.current = pages[target]?.anchor || 0
    setDirection(target >= currentPage ? 'next' : 'previous')
    setPage(target)
    resetChromeTimer(false)
  }, [currentPage, pages, setPage, resetChromeTimer])
  const goToBookmark = useCallback((item: ReaderBookmark) => {
    const anchor = Number(item.anchor_offset || 0)
    goTo(anchor ? Math.max(0, pages.findLastIndex((page) => page.anchor <= anchor)) : item.page_number)
  }, [goTo, pages])
  const previous = useCallback(() => goTo(currentPage - 1), [currentPage, goTo])
  const next = useCallback(() => goTo(currentPage + 1), [currentPage, goTo])
  const close = useCallback(() => router.replace(safeRoute(search.get('from'), `/book/${bookId}/details?source=${source}`)), [router, search, bookId, source])

  useEffect(() => { const keys = (event: KeyboardEvent) => { if (event.key === 'ArrowRight') next(); if (event.key === 'ArrowLeft') previous() }; window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys) }, [next, previous])

  useEffect(() => {
    const onSelection = () => {
      const selected = window.getSelection()
      if (!selected || selected.isCollapsed || !selected.rangeCount) { setSelection(null); return }
      const range = selected.getRangeAt(0)
      if (!stageRef.current?.contains(range.commonAncestorContainer)) return
      const startElement = (range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement)?.closest('[data-reader-anchor]') as HTMLElement | null
      const endElement = (range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer as Element : range.endContainer.parentElement)?.closest('[data-reader-anchor]') as HTMLElement | null
      if (!startElement || !endElement) return
      const bounds = range.getBoundingClientRect()
      setSelection({
        text: selected.toString().trim(),
        anchorStart: Math.min(Number(startElement.dataset.readerAnchor), Number(endElement.dataset.readerAnchor)),
        anchorEnd: Math.max(Number(startElement.dataset.readerAnchor), Number(endElement.dataset.readerAnchor)),
        x: Math.max(12, Math.min(window.innerWidth - 12, bounds.left + bounds.width / 2)),
        y: Math.max(66, bounds.top - 12),
      })
      setCopied(false); setDictionary('')
    }
    document.addEventListener('selectionchange', onSelection)
    return () => document.removeEventListener('selectionchange', onSelection)
  }, [])

  async function bookmark() {
    if (!profile || !book) return
    await toggleBookmark(profile.id, book.id, book.source, currentPage, '', pages[currentPage]?.anchor || 0)
    setBookmarks(await getBookmarks(profile.id, book.id, book.source) as ReaderBookmark[])
  }
  const searchPages = useCallback((query: string) => { const normalized = query.trim().toLocaleLowerCase(); if (!normalized) return; const found = pages.findIndex((item) => readerPageText(item).toLocaleLowerCase().includes(normalized)); if (found >= 0) { setSearchMatch(query.trim()); goTo(found) } }, [pages, goTo])

  async function saveHighlight(color: HighlightColor, note = '') {
    if (!selection || !profile || !book) return
    try {
      const created = await createHighlight({ userId: profile.id, bookId: book.id, source: book.source, anchorStart: selection.anchorStart, anchorEnd: selection.anchorEnd, selectedText: selection.text, color, note })
      setHighlights((items) => [...items, created])
      window.getSelection()?.removeAllRanges(); setSelection(null)
    } catch (cause) { setDictionary(cause instanceof Error ? cause.message : t('highlightUnavailable')) }
  }
  async function lookupDictionary() {
    if (!selection) return
    const word = selection.text.trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '')
    if (!word) return
    setDictionary(t('dictionaryLoading'))
    try {
      const language = (book?.language || '').toLowerCase().startsWith('en') ? 'en' : 'pt'
      if (language === 'en') {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
        const data = await response.json()
        setDictionary(data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition || t('dictionaryUnavailable'))
      } else {
        const response = await fetch(`https://pt.wikipedia.org/w/api.php?action=opensearch&origin=*&format=json&limit=1&search=${encodeURIComponent(word)}`)
        const data = await response.json()
        setDictionary(data?.[2]?.[0] || t('dictionaryUnavailable'))
      }
    } catch { setDictionary(t('dictionaryUnavailable')) }
  }
  async function shareSelection() {
    if (!selection) return
    if (navigator.share) await navigator.share({ text: selection.text, title: book?.title })
    else await navigator.clipboard.writeText(selection.text)
  }

  const percentage = pages.length ? Math.round(((currentPage + 1) / pages.length) * 100) : 0
  const chapter = pages[currentPage]?.chapterTitle || ''
  const windowStart = Math.max(0, Math.min(currentPage - 3, Math.max(0, pages.length - 8)))
  const contentWindow = pages.slice(windowStart, windowStart + 8)
  const coverPage: ReaderPage | null = book && windowStart === 0 ? { chapterTitle: book.title, pageNumber: 0, anchor: 0, blocks: [], isCover: true, coverUrl: book.cover_url || undefined } : null
  const flipPages = coverPage ? [coverPage, ...contentWindow] : contentWindow
  const visualOffset = coverPage ? 1 : 0
  const isBookmarked = bookmarks.some((item) => item.page_number === currentPage || Number(item.anchor_offset || -1) === Number(pages[currentPage]?.anchor || 0))

  function stageClick(event: React.MouseEvent<HTMLElement>) {
    if ((event.target as Element).closest('button,input,a,select,.reader-selection-toolbar') || window.getSelection()?.toString()) return
    const ratio = event.clientX / window.innerWidth
    if (ratio > .25 && ratio < .75) {
      setChromeVisible((value) => !value)
      if (!chromeVisible) resetChromeTimer(true)
      else if (chromeTimerRef.current) window.clearTimeout(chromeTimerRef.current)
    }
  }

  return <main ref={shellRef} className={`reader-shell reader-theme-${theme} reader-quality-${renderQuality} reader-animation-${animation} ${chromeVisible ? 'is-chrome-visible' : 'is-chrome-hidden'}`} style={{ ['--reader-page-gap' as string]: `${pageGap}px`, ['--reader-brightness' as string]: `${brightness}%`, ['--reader-curl-x' as string]: curlSide === 'right' ? '92%' : '8%' }} onPointerMove={() => chromeVisible && resetChromeTimer(false)}>
    {book && <div className="reader-toolbar-wrap"><ReaderToolbar title={book.title} chapter={chapter} currentPage={currentPage} bookmarks={bookmarks} bookmarked={isBookmarked} onClose={close} onSearch={searchPages} onToggleBookmark={bookmark} onNavigateBookmark={goToBookmark} /></div>}
    <section ref={stageRef} className="reader-stage" onClick={stageClick}>
      {loading && <div className="reader-status"><LoaderCircle className="animate-spin" /><p>{t('preparing')}</p></div>}
      {!loading && error && <div className="reader-status max-w-md text-center"><AlertCircle /><p>{error}</p><button onClick={() => setReloadKey((value) => value + 1)} className="secondary-btn !min-h-10"><RotateCcw size={15} /> {t('retry')}</button></div>}
      {!loading && !error && book && pages.length > 0 && <>
        {showChapters && <aside className="reader-side-panel reader-chapters-panel"><h2>{t('chapters')}</h2>{sourceChapters.map((item) => { const index = pages.findIndex((page) => page.chapterTitle === item.title); return <button key={item.id} onClick={() => goTo(Math.max(0, index))}>{item.title}</button> })}</aside>}
        {showThumbnails && <aside className="reader-side-panel reader-thumbnails-panel"><h2>{t('thumbnails')}</h2>{pages.map((item, index) => <button key={`${item.anchor}-${index}`} onClick={() => goTo(index)} className={index === currentPage ? 'is-active' : ''}><span>{readerPageText(item).slice(0, 55)}</span><b>{index + 1}</b></button>)}</aside>}
        {viewMode === 'scroll' ? <section className="reader-scroll-view" aria-label={t('scroll')}>
          <div className="reader-scroll-spacer" style={{ height: scrollWindowStart * (dimensions.height + pageGap) }} />
          {scrollPages.map((item, offset) => { const index = scrollWindowStart + offset; return <button key={`${item.anchor}-${index}`} onClick={() => goTo(index)} className={`reader-scroll-page ${index === currentPage ? 'is-current' : ''}`} style={{ minHeight: dimensions.height }}><Page page={item} total={pages.length} query={index === currentPage ? searchMatch : ''} highlights={highlights} /></button> })}
          <div className="reader-scroll-spacer" style={{ height: Math.max(0, pages.length - scrollWindowStart - scrollPages.length) * (dimensions.height + pageGap) }} />
        </section> : animation === 'real-page' ? <>
          <button onClick={() => flipRef.current?.pageFlip()?.flipPrev()} className="reader-arrow reader-arrow-left" aria-label={t('previous')}><ChevronLeft /></button>
          <div className={`pageflip-frame ${dimensions.portrait ? 'is-portrait' : 'is-spread'} is-curl-${curlSide}`} style={{ width: dimensions.portrait ? dimensions.width : dimensions.width * 2, height: dimensions.height }}><HTMLFlipBook key={`${book.id}-${windowStart}-${dimensions.width}-${wordsPerPage}`} ref={flipRef} width={dimensions.width} height={dimensions.height} size="fixed" minWidth={dimensions.width} maxWidth={dimensions.width} minHeight={dimensions.height} maxHeight={dimensions.height} drawShadow maxShadowOpacity={renderQuality === 'smooth' ? 0.68 : 0.34} showCover={Boolean(coverPage)} mobileScrollSupport useMouseEvents swipeDistance={24} flippingTime={renderQuality === 'smooth' ? 720 : 380} startPage={Math.min(currentPage - windowStart + visualOffset, flipPages.length - 1)} usePortrait={dimensions.portrait} autoSize={false} onChangeOrientation={() => resetChromeTimer(false)} onFlip={(event: { data: number }) => { const logical = windowStart + event.data - visualOffset; setCurlSide(logical >= currentPage ? 'right' : 'left'); if (logical >= 0) goTo(logical) }} className="pageflip-book">{flipPages.map((page, index) => <Page key={page.isCover ? 'reader-cover' : `${page.anchor}-${index}`} page={page} total={pages.length} query={!page.isCover && page.pageNumber - 1 === currentPage ? searchMatch : ''} highlights={highlights} />)}</HTMLFlipBook></div>
          <button onClick={() => flipRef.current?.pageFlip()?.flipNext()} className="reader-arrow reader-arrow-right" aria-label={t('next')}><ChevronRight /></button>
        </> : <>
          <button onClick={previous} className="reader-arrow reader-arrow-left" aria-label={t('previous')}><ChevronLeft /></button>
          <div key={`${currentPage}-${animation}`} className={`reader-single-page reader-transition-${animation} is-${direction}`} style={{ width: dimensions.width, height: dimensions.height }}><Page page={pages[currentPage]} total={pages.length} query={searchMatch} highlights={highlights} /></div>
          <button onClick={next} className="reader-arrow reader-arrow-right" aria-label={t('next')}><ChevronRight /></button>
        </>}
      </>}
    </section>
    {selection && <SelectionToolbar selection={selection} copied={copied} dictionary={dictionary} onCopy={async () => { await navigator.clipboard.writeText(selection.text); setCopied(true) }} onHighlight={(color) => saveHighlight(color)} onNote={() => { const note = window.prompt(t('notePrompt'), '') || ''; if (note) saveHighlight('yellow', note) }} onDictionary={lookupDictionary} onShare={shareSelection} onClose={() => { window.getSelection()?.removeAllRanges(); setSelection(null) }} />}
    {book && pages.length > 0 && <footer className="reader-footer"><ThemeSwitcher /><input className="reader-range" type="range" min={0} max={Math.max(0, pages.length - 1)} value={currentPage} onChange={(event) => goTo(Number(event.target.value))} aria-label={t('readingProgress')} style={{ ['--reader-progress' as string]: `${percentage}%` }} /><span className="reader-progress-label">{currentPage + 1}/{pages.length} · {percentage}%</span>{progressError && <span className="reader-save-error" title={progressError}>{t('notSaved')}</span>}</footer>}
  </main>
}
