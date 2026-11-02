// Autenticação no servidor Workers: JWT HS256 assinado via WebCrypto + hash de senha.
// O hash pesado (PBKDF2) roda no navegador; o servidor só compara SHA-256 (barato em CPU).
import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const SESSION_COOKIE = 'readr_session'
export const SESSION_TTL = 7 * 24 * 60 * 60 // 7 dias

export interface SessionUser {
  id: string
  email: string
}

export interface RpcPContext {
  user: SessionUser | null
}

const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBuffer(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function hmacKey(): Promise<CryptoKey> {
  const env = getCloudflareContext().env as { JWT_SECRET?: string }
  const secret = env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET não está configurado (wrangler secret put JWT_SECRET).')
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

export async function signSessionToken(userId: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = { sub: userId, iat: issuedAt, exp: issuedAt + SESSION_TTL, iss: 'readr' }
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(`${head}.${body}`))
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [head, body, signature] = parts
  const expected = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(`${head}.${body}`))
  const provided = base64UrlToBuffer(signature)
  const expectedBytes = new Uint8Array(expected)
  if (provided.length !== expectedBytes.length) return null
  let mismatch = 0
  for (let i = 0; i < provided.length; i += 1) mismatch |= provided[i] ^ expectedBytes[i]
  if (mismatch !== 0) return null

  let payload: { sub?: string; exp?: number }
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBuffer(body)))
  } catch {
    return null
  }
  if (!payload.sub || !payload.exp || payload.exp * 1000 < Date.now()) return null
  return { id: payload.sub, email: '' }
}

function cookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name) out[name] = decodeURIComponent(rest.join('='))
  }
  return out
}

/** Lê a sessão do cookie httpOnly ou do header Authorization: Bearer. */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const header = request.headers.get('authorization')
  const bearerToken = header?.startsWith('Bearer ') ? header.slice(7).trim() : null
  const token = bearerToken || cookies(request.headers.get('cookie'))[SESSION_COOKIE]
  if (!token) return null
  return verifySessionToken(token)
}

export function sessionCookie(value: string, maxAge: number) {
  return {
    name: SESSION_COOKIE,
    value,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: true,
    path: '/',
    maxAge,
  }
}

export function respondWithSession(response: NextResponse, token: string) {
  response.cookies.set(sessionCookie(token, SESSION_TTL))
  return response
}

/** Verificação do par k do navegador: sha256(salt ‖ k) constante à máscara. */
export const PASSWORD_PEPPER = 'readr-v1'

export async function hashClientKey(k: string, kdfSalt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${kdfSalt}\u0000${k}\u0000${PASSWORD_PEPPER}`))
  return toHex(digest)
}

export function constantTimeEquals(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length)
  let mismatch = a.length === b.length ? 0 : 1
  for (let i = 0; i < length; i += 1) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return mismatch === 0
}

export function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes)
  crypto.getRandomValues(buffer)
  return toHex(buffer.buffer as ArrayBuffer)
}
