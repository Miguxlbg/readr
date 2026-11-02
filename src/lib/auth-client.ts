// Coerente com src/server/auth.ts e src/app/api/auth/*: a derivação PBKDF2 pesada
// acontece no navegador; o servidor apenas compara SHA-256(salt ‖ k).
const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer | ArrayBufferView): string {
  const bytes = buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function normalizeIdentifier(value: string) {
  return value.trim().toLocaleLowerCase('pt-BR').replace(/^@/, '')
}

async function deriveKey(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(`readr-v1|${salt}`).buffer as ArrayBuffer, iterations: 310_000 },
    key,
    256,
  )
  return toHex(bits)
}

export const AUTH_EVENT = 'readr:auth-change'

export function notifyAuthChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EVENT))
}

export async function signUp(displayName: string, nickname: string, email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedName = displayName.trim()
  const normalizedNickname = normalizeIdentifier(nickname)
  if (!normalizedName || !normalizedNickname || !normalizedEmail) throw new Error('Preencha nome, apelido e e-mail.')
  if (!password) throw new Error('Escolha uma senha.')

  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
  const k = await deriveKey(password, salt)

  const response = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: normalizedName, nickname: normalizedNickname, email: normalizedEmail, salt, k }),
  })
  const result = await response.json() as { ok?: boolean; error?: string }
  if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível criar a conta.')
  notifyAuthChanged()
}

export async function signIn(identifier: string, password: string) {
  const normalized = normalizeIdentifier(identifier)
  if (!normalized) throw new Error('Informe seu e-mail ou apelido.')
  if (!password) throw new Error('Informe sua senha.')

  const saltResponse = await fetch('/api/auth/kdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: normalized }),
  })
  const saltResult = await saltResponse.json() as { salt?: string; error?: string }
  if (!saltResponse.ok || !saltResult.salt) throw new Error(saltResult.error || 'Não foi possível entrar.')

  const k = await deriveKey(password, saltResult.salt)
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: normalized, k }),
  })
  const result = await response.json() as { ok?: boolean; profile?: unknown; error?: string }
  if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível entrar.')
  notifyAuthChanged()
  return result.profile
}

export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
  notifyAuthChanged()
}
