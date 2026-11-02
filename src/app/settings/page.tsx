'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlignJustify, BookOpen, Globe2, MoonStar, Trash2, Type } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { ThemeSwitcher } from '@/components/reader/ThemeSwitcher'
import { useAppTheme } from '@/components/ui/AppThemeProvider'
import { useLanguage, type AppLanguage } from '@/components/ui/LanguageProvider'
import { signOut } from '@/lib/auth-client'
import { useReaderStore } from '@/store/readerStore'

export default function SettingsPage() {
  const t = useTranslations('settings')
  const common = useTranslations('common')
  const router = useRouter()
  const { theme, setTheme } = useAppTheme()
  const { language, setLanguage } = useLanguage()
  const { fontFamily, setFontFamily, fontSize, setFontSize, margin, setMargin, lineSpacing, setLineSpacing } = useReaderStore()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function deleteAccount() {
    if (!window.confirm(t('deleteConfirm'))) return
    setDeleting(true)
    setError('')
    try {
      const response = await fetch('/api/auth/delete-account', { method: 'DELETE' })
      const result = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível excluir a conta.')
      await signOut().catch(() => undefined)
      router.replace('/auth/signup')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a conta.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-5xl px-5 pb-14 sm:px-8">
        <header className="border-b border-line pb-7"><p className="eyebrow">{t('eyebrow')}</p><h1 className="mt-2 font-serif text-5xl">{t('title')}</h1><p className="mt-3 text-sm text-muted">{t('subtitle')}</p></header>
        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <Setting title={t('appTheme')} subtitle={theme === 'dark' ? t('dark') : t('light')} icon={MoonStar}><div className="flex gap-2"><Choice active={theme === 'light'} onClick={() => setTheme('light')}>{t('light')}</Choice><Choice active={theme === 'dark'} onClick={() => setTheme('dark')}>{t('dark')}</Choice></div></Setting>
          <Setting title={t('language')} subtitle="Português, English, Español" icon={Globe2}><select className="field max-w-xs" value={language} onChange={(event) => setLanguage(event.target.value as AppLanguage)}><option value="pt">Português</option><option value="en">English</option><option value="es">Español</option></select></Setting>
          <Setting title={t('readerDefaults')} subtitle="Tema do papel" icon={BookOpen}><ThemeSwitcher /></Setting>
          <Setting title="Tipografia" subtitle={`${fontSize}px`} icon={Type}><div className="mb-4 flex gap-2"><Choice active={fontFamily === 'serif'} onClick={() => setFontFamily('serif')}>Serif</Choice><Choice active={fontFamily === 'sans'} onClick={() => setFontFamily('sans')}>Sans</Choice></div><input className="w-full" type="range" min="13" max="28" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></Setting>
          <Setting title="Margens" subtitle={`${margin}px`} icon={AlignJustify}><input className="w-full" type="range" min="18" max="70" value={margin} onChange={(event) => setMargin(Number(event.target.value))} /></Setting>
          <Setting title="Espaçamento" subtitle={lineSpacing.toFixed(1)} icon={AlignJustify}><input className="w-full" type="range" min="1.3" max="2.1" step="0.1" value={lineSpacing} onChange={(event) => setLineSpacing(Number(event.target.value))} /></Setting>
        </section>
        <section className="mt-10 rounded-2xl border border-coral/40 bg-coral/5 p-6"><Trash2 className="text-coral" size={20} /><h2 className="mt-4 text-sm font-semibold">{t('deleteAccount')}</h2><p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted">{t('deleteDescription')}</p><button disabled={deleting} onClick={deleteAccount} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-coral px-4 text-xs font-semibold text-white disabled:opacity-50"><Trash2 size={15} />{deleting ? t('deleting') : t('deleteAction')}</button>{error && <p className="mt-3 text-xs text-coral" role="alert">{error}</p>}</section>
        <p className="mt-5 text-[10px] text-muted">{common('save')}: preferências persistidas automaticamente neste dispositivo.</p>
      </section>
    </AppShell>
  )
}

function Setting({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: typeof Type; children: React.ReactNode }) {
  return <article className="panel min-h-[190px] p-6"><Icon size={21} strokeWidth={1.5} /><h2 className="mt-5 text-sm font-semibold">{title}</h2><p className="mt-1 text-[11px] text-muted">{subtitle}</p><div className="mt-6">{children}</div></article>
}
function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-lg border px-4 py-2 text-sm ${active ? 'border-ink bg-white/70 text-ink' : 'border-line'}`}>{children}</button>
}
