'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { signIn } from '@/lib/auth-client'

export function LoginForm() {
  const router = useRouter()
  const t = useTranslations('auth')
  const common = useTranslations('common')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(identifier, password)
      router.replace('/')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block"><span className="mb-2 block text-xs font-medium">{t('identifier')}</span><input className="field" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="seu@email.com ou @apelido" autoComplete="username" required /></label>
      <label className="block"><span className="mb-2 block text-xs font-medium">{t('password')}</span><input className="field" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" type="password" autoComplete="current-password" required /></label>
      {error && <p className="rounded-lg bg-coral/10 p-3 text-xs text-coral" role="alert">{error}</p>}
      <button className="primary-btn w-full" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" size={18} /> : <>{common('signIn')} <ArrowRight size={17} /></>}</button>
      <p className="text-center text-xs text-muted">Ainda não tem conta? <Link href="/auth/signup" className="font-semibold text-coral hover:underline">Criar conta</Link></p>
    </form>
  )
}
