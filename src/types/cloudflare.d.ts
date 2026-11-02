/**
 * Tipos mínimos do runtime do Cloudflare na medida que o Readr usa.
 * O `cloudflare-env.d.ts` (gerado) só declara a interface CloudflareEnv com estes nomes;
 * evitamos os runtime types completos do workerd para não colidirem com a lib.dom no navegador.
 */
interface D1Meta {
  duration: number
  size_after: number
  rows_read: number
  rows_written: number
  changes: number
  last_row_id: number
}

interface D1QueryResult<T = Record<string, unknown>> {
  results: T[]
  success: boolean
  meta: D1Meta
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, any>>(column?: string): Promise<T | null>
  run<T = Record<string, unknown>>(): Promise<D1QueryResult<T>>
  all<T = Record<string, unknown>>(): Promise<D1QueryResult<T>>
  raw(): Promise<unknown[][]>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<Array<D1QueryResult<any>>>
}

interface Fetcher {
  fetch(input: Request | URL | string, init?: RequestInit): Promise<Response>
}
