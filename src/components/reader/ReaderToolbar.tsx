'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bookmark, BookOpen, ChevronLeft, Columns2, List, Minus, MoreHorizontal, Plus, Search, Settings2, Sun, Type } from 'lucide-react'
import { useReaderStore, type ReaderAnimation } from '@/store/readerStore'
import { READER_FONTS } from '@/lib/reader/fonts'
import type { ReaderBookmark, ReaderFontId } from '@/lib/types'

interface ReaderToolbarProps {
  title: string
  chapter: string
  currentPage: number
  bookmarks: ReaderBookmark[]
  bookmarked: boolean
  onClose: () => void
  onSearch: (query: string) => void
  onToggleBookmark: () => void
  onNavigateBookmark: (bookmark: ReaderBookmark) => void
}

export function ReaderToolbar({ title, chapter, currentPage, bookmarks, bookmarked, onClose, onSearch, onToggleBookmark, onNavigateBookmark }: ReaderToolbarProps) {
  const t = useTranslations('reader')
  const store = useReaderStore()
  const [options, setOptions] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  return <header className="reader-toolbar">
    <button onClick={onClose} className="reader-icon-button" aria-label={t('closeReader')}><ChevronLeft size={19} /></button>
    <div className="reader-toolbar-title"><p>{title}</p><h1>{chapter}</h1></div>
    <nav className="reader-toolbar-actions" aria-label={t('readerTools')}>
      <ToolbarButton label={t('search')} onClick={() => setSearchOpen((value) => !value)} icon={Search} />
      <ToolbarButton label={t('chapters')} onClick={() => store.setShowChapters(!store.showChapters)} icon={List} desktop />
      <ToolbarButton label={t('fontDecrease')} onClick={() => store.setFontSize(Math.max(13, store.fontSize - 1))} icon={Minus} />
      <ToolbarButton label={t('fonts')} onClick={() => setOptions(true)} icon={Type} />
      <ToolbarButton label={t('fontIncrease')} onClick={() => store.setFontSize(Math.min(28, store.fontSize + 1))} icon={Plus} />
      <ToolbarButton label={t('readingOptions')} onClick={() => setOptions((value) => !value)} icon={MoreHorizontal} desktop />
      <button onClick={onToggleBookmark} className={`reader-icon-button ${bookmarked ? 'is-active' : ''}`} aria-label={bookmarked ? t('removeBookmark') : t('savePage')}><Bookmark size={18} fill={bookmarked ? 'currentColor' : 'none'} /></button>
    </nav>

    {searchOpen && <form onSubmit={(event) => { event.preventDefault(); onSearch(store.searchQuery) }} className="reader-popover reader-search-popover"><input autoFocus className="field !py-2" value={store.searchQuery} onChange={(event) => store.setSearchQuery(event.target.value)} placeholder={t('searchPlaceholder')} /><button className="primary-btn !min-h-9 !px-4">{t('search')}</button></form>}

    {options && <aside className="reader-popover reader-options-popover">
      <h2 className="reader-options-heading"><Settings2 size={16} /> {t('readingOptions')}</h2>
      <section className="reader-font-picker" aria-label={t('fonts')}>
        <p>{t('fonts')}</p>
        <div className="reader-font-grid">
          {READER_FONTS.map((font) => <button
            key={font.id}
            className={store.fontFamily === font.id ? 'is-selected' : ''}
            style={{ fontFamily: font.css }}
            onClick={() => store.setFontFamily(font.id as ReaderFontId)}
          ><strong>{font.label}</strong><span>{t('fontPreview')}</span></button>)}
        </div>
      </section>
      <Control icon={Sun} label={`${t('brightness')} ${store.brightness}%`}><input className="reader-control-range" type="range" min="45" max="115" value={store.brightness} onChange={(event) => store.setBrightness(Number(event.target.value))} /></Control>
      <Control icon={Columns2} label={`${t('margin')} ${store.margin}px`}><input className="reader-control-range" type="range" min="18" max="70" value={store.margin} onChange={(event) => store.setMargin(Number(event.target.value))} /></Control>
      <Control icon={Type} label={`${t('lineSpacing')} ${store.lineSpacing.toFixed(1)}`}><input className="reader-control-range" type="range" min="1.3" max="2.1" step="0.1" value={store.lineSpacing} onChange={(event) => store.setLineSpacing(Number(event.target.value))} /></Control>
      <Control icon={BookOpen} label={`${t('pageGap')} ${store.pageGap}px`}><input className="reader-control-range" type="range" min="8" max="32" value={store.pageGap} onChange={(event) => store.setPageGap(Number(event.target.value))} /></Control>
      <div className="reader-option-selects">
        <Select label={t('view')} value={store.viewMode} onChange={store.setViewMode} options={[["pages",t('pages')],["scroll",t('scroll')]]} />
        <Select label={t('quality')} value={store.renderQuality} onChange={store.setRenderQuality} options={[["battery",t('battery')],["smooth",t('smooth')]]} />
        <Select label={t('animation')} value={store.animation} onChange={(value) => store.setAnimation(value as ReaderAnimation)} options={[["real-page",t('pageCurl')],["slide",t('slide')],["fade",t('fade')]]} />
      </div>
      <div className="reader-option-toggles">
        <Toggle active={store.showThumbnails} onClick={() => store.setShowThumbnails(!store.showThumbnails)} icon={Columns2} label={t('thumbnails')} />
        <Toggle active={store.showChapters} onClick={() => store.setShowChapters(!store.showChapters)} icon={List} label={t('chapters')} />
        <Toggle active={store.showBookmarks} onClick={() => store.setShowBookmarks(!store.showBookmarks)} icon={Bookmark} label={`${t('bookmarks')} (${bookmarks.length})`} />
      </div>
      {store.showBookmarks && <div className="reader-bookmarks-list">{bookmarks.length ? bookmarks.map((item) => <button key={item.id} onClick={() => onNavigateBookmark(item)} className={item.page_number === currentPage ? 'is-current' : ''}>{t('bookmarks')} · {item.page_number + 1}</button>) : <p>{t('noBookmarks')}</p>}</div>}
    </aside>}
  </header>
}

function ToolbarButton({ label, onClick, icon: Icon, desktop = false }: { label: string; onClick: () => void; icon: typeof Search; desktop?: boolean }) { return <button onClick={onClick} className={`reader-icon-button ${desktop ? 'reader-desktop-tool' : ''}`} aria-label={label}><Icon size={17} /></button> }
function Control({ icon: Icon, label, children }: { icon: typeof Sun; label: string; children: React.ReactNode }) { return <label className="reader-option-control"><Icon size={14} /><span>{label}</span><span className="reader-option-control-input">{children}</span></label> }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: any) => void; options: string[][] }) { return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label> }
function Toggle({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Type; label: string }) { return <button onClick={onClick} className={active ? 'is-active' : ''}><Icon size={14} />{label}</button> }
