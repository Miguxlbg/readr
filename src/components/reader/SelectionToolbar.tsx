'use client'

import { BookOpen, Check, Copy, Highlighter, MessageSquareText, Share2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { HighlightColor } from '@/lib/types'

export interface ReaderSelection {
  text: string
  anchorStart: number
  anchorEnd: number
  x: number
  y: number
}

export function SelectionToolbar({
  selection,
  copied,
  dictionary,
  onCopy,
  onHighlight,
  onNote,
  onDictionary,
  onShare,
  onClose,
}: {
  selection: ReaderSelection
  copied: boolean
  dictionary: string
  onCopy: () => void
  onHighlight: (color: HighlightColor) => void
  onNote: () => void
  onDictionary: () => void
  onShare: () => void
  onClose: () => void
}) {
  const t = useTranslations('reader')
  return <aside
    className="reader-selection-toolbar"
    style={{ left: selection.x, top: selection.y }}
    role="toolbar"
    aria-label={t('selectionActions')}
    onMouseDown={(event) => event.preventDefault()}
  >
    <div className="reader-selection-actions">
      <Action label={copied ? t('copied') : t('copy')} onClick={onCopy} icon={copied ? Check : Copy} />
      <div className="reader-highlight-control" aria-label={t('highlight')}>
        <Highlighter size={15} />
        {(['yellow', 'green', 'blue', 'pink'] as HighlightColor[]).map((color) => <button key={color} className={`reader-highlight-dot is-${color}`} onClick={() => onHighlight(color)} aria-label={`${t('highlight')} ${color}`} />)}
      </div>
      <Action label={t('note')} onClick={onNote} icon={MessageSquareText} />
      <Action label={t('dictionary')} onClick={onDictionary} icon={BookOpen} />
      <Action label={t('share')} onClick={onShare} icon={Share2} />
      <Action label={t('closeSelection')} onClick={onClose} icon={X} />
    </div>
    {dictionary && <p className="reader-dictionary-result" aria-live="polite">{dictionary}</p>}
  </aside>
}

function Action({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: typeof Copy }) {
  return <button className="reader-selection-action" onClick={onClick} aria-label={label} title={label}><Icon size={15} /><span>{label}</span></button>
}
