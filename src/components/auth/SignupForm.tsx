'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { signUp } from '@/lib/auth-client'

export function SignupForm() {
  const router = useRouter()
  const t = useTranslations('auth')
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signUp(name, nickname, email, password)
      router.replace('/')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a conta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className="mb-2 block text-xs font-medium">{t('name')}</span><input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" autoComplete="name" minLength={2} required /></label>
      <label className="block"><span className="mb-2 block text-xs font-medium">{t('nickname')}</span><input className="field" value={nickname} onChange={(event) => setNickname(event.target.value.toLowerCase().replace(/\s/g, ''))} placeholder="seuapelido" autoComplete="nickname" minLength={3} maxLength={24} pattern="[A-Za-z0-9._\-]+" required /><small className="mt-1.5 block text-[10px] text-muted">{t('nicknameHint')}</small></label>
      <label className="block"><span className="mb-2 block text-xs font-medium">{t('email')}</span><input className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com" type="email" autoComplete="email" required /></label>
      <label className="block"><span className="mb-2 block text-xs font-medium">{t('password')}</span><input className="field" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('choosePassword')} type="password" autoComplete="new-password" required /></label>
      {error && <p className="rounded-lg bg-coral/10 p-3 text-xs text-coral" role="alert">{error}</p>}
      <button className="primary-btn w-full" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" size={18} /> : <>{t('createAndEnter')} <ArrowRight size={17} /></>}</button>
      <p className="text-center text-xs text-muted">Já tem conta? <Link href="/auth/login" className="font-semibold text-coral hover:underline">Entrar</Link></p>
    </form>
  )
}
