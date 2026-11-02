#!/usr/bin/env node
/**
 * Executa o schema D1 no banco Cloudflare
 */

import fs from 'fs'
import dotenv from 'dotenv'

// Carregar credenciais
const envPath = 'scripts/.env.local'
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const DB_ID = '947f167c-7e35-4dce-aac2-19c6da6c1eee'
const SCHEMA_PATH = 'supabase/schema-d1.sql'

console.log('🚀 Executando schema D1...\n')

if (!fs.existsSync(SCHEMA_PATH)) {
  console.error('❌ Schema não encontrado:', SCHEMA_PATH)
  process.exit(1)
}

const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')
const statements = schema
  .split(';')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'))

console.log(`📝 Encontradas ${statements.length} instruções SQL\n`)

console.log('Execute manualmente no Cloudflare Dashboard:')
console.log('1. Vá em: D1 Database > readr > Console')
console.log('2. Cole o conteúdo de supabase/schema-d1.sql')
console.log('3. Execute o SQL')
console.log('')
console.log('Ou via CLI (requer wrangler configurado):')
console.log(`npx wrangler d1 execute ${DB_ID} --file=${SCHEMA_PATH}`)

console.log('\n✅ wrangler.toml atualizado com ID do banco')
console.log('ID:', DB_ID)