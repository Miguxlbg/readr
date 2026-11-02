#!/usr/bin/env node
/**
 * Script de configuração automática do Readr na Cloudflare
 * 
 * Uso: node scripts/setup-cloudflare.js
 * 
 * Requer as seguintes variáveis de ambiente:
 * - CF_API_TOKEN: Token da API Cloudflare
 * - CF_ACCOUNT_ID: ID da conta Cloudflare
 * - CF_ZONE_ID (opcional): ID da zona para domínios personalizados
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// Carregar .env.cloudflare se existir
const envPath = path.join(dirname(fileURLToPath(import.meta.url)), '.env.cloudflare')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const __dirname = dirname(fileURLToPath(import.meta.url))

// Configurações
const PROJECT_NAME = 'readr'
const R2_BUCKETS = ['covers', 'avatars', 'uploads']
const D1_DATABASE_NAME = 'readr-db'

// Cores para output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m'
}

function log(message, color = 'blue') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logError(message) {
  console.error(`${colors.red}❌ ${message}${colors.reset}`)
}

function logSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`)
}

// Verificar se wrangler está instalado
function checkWrangler() {
  try {
    const version = execSync('npx wrangler --version', { encoding: 'utf-8' }).trim()
    log(`Wrangler versão ${version} encontrado`)
    return true
  } catch (error) {
    logError('Wrangler não encontrado')
    log('Instale com: npm install -g wrangler')
    return false
  }
}

// Verificar credenciais
function checkCredentials() {
  const token = process.env.CF_API_TOKEN
  const accountId = process.env.CF_ACCOUNT_ID
  
  if (!token) {
    logError('CF_API_TOKEN não está definido')
    log('Configure com: export CF_API_TOKEN="seu-token-aqui"')
    return false
  }
  
  if (!accountId) {
    logError('CF_ACCOUNT_ID não está definido')
    log('Encontre seu Account ID em: https://dash.cloudflare.com/profile/api-tokens')
    return false
  }
  
  logSuccess('Credenciais verificadas')
  return true
}

// Criar buckets R2
function createR2Buckets() {
  log('\n📦 Criando buckets R2...')
  
  for (const bucket of R2_BUCKETS) {
    try {
      execSync(`npx wrangler r2 bucket create ${bucket}`, { encoding: 'utf-8', stdio: 'inherit' })
      logSuccess(`Bucket R2 "${bucket}" criado`)
    } catch (error) {
      if (error.message?.includes('already exists')) {
        log(`Bucket R2 "${bucket}" já existe`)
      } else {
        logError(`Erro ao criar bucket ${bucket}: ${error.message}`)
      }
    }
  }
}

// Criar banco D1
function createD1Database() {
  log('\n🗄️ Criando banco D1...')
  
  try {
    const output = execSync(`npx wrangler d1 create ${D1_DATABASE_NAME}`, { encoding: 'utf-8' })
    const match = output.match(/id = "([a-f0-9-]+)"/i)
    
    if (match) {
      const dbId = match[1]
      logSuccess(`Banco D1 "${D1_DATABASE_NAME}" criado (ID: ${dbId})`)
      return dbId
    }
  } catch (error) {
    if (error.message?.includes('already exists')) {
      log(`Banco D1 "${D1_DATABASE_NAME}" já existe`)
      // Tentar obter o ID existente
      try {
        const output = execSync(`npx wrangler d1 list`, { encoding: 'utf-8' })
        const match = output.match(new RegExp(`${D1_DATABASE_NAME}[^|]*\\|\\s*([a-f0-9-]+)`))
        if (match) return match[1]
      } catch {}
    } else {
      logError(`Erro ao criar banco D1: ${error.message}`)
    }
  }
  return null
}

// Executar schema
function executeSchema(dbId) {
  log('\n📝 Executando schema D1...')
  
  const schemaPath = path.join(__dirname, '../supabase/schema-d1.sql')
  
  if (!fs.existsSync(schemaPath)) {
    logError(`Schema não encontrado: ${schemaPath}`)
    return false
  }
  
  try {
    execSync(`npx wrangler d1 execute readr-db --file=${schemaPath}`, { encoding: 'utf-8', stdio: 'inherit' })
    logSuccess('Schema executado com sucesso')
    return true
  } catch (error) {
    logError(`Erro ao executar schema: ${error.message}`)
    return false
  }
}

// Configurar wrangler.toml
function configureWrangler(dbId, zoneId = null) {
  log('\n⚙️ Atualizando wrangler.toml...')
  
  const wranglerPath = path.join(__dirname, '../wrangler.toml')
  let content = fs.readFileSync(wranglerPath, 'utf-8')
  
  // Remover comentários antigos sobre D1/R2 se existirem
  content = content.replace(/\[\[d1_databases\]\][^\[]*/g, '')
  content = content.replace(/\[\[r2_buckets\]\][^\[]*/g, '')
  content = content.replace(/JWT_SECRET[^\n]*\n/g, '')
  
  // Adicionar D1
  const d1Config = dbId ? `\n[[d1_databases]]\nbinding = "DB"\nid = "${dbId}"\n` : ''
  
  // Adicionar R2 buckets
  let r2Config = '\n'
  R2_BUCKETS.forEach((bucket, index) => {
    const binding = index === 0 ? 'R2' : index === 1 ? 'R2_AVATARS' : 'R2_UPLOADS'
    r2Config += `[[r2_buckets]]\nbinding = "${binding}"\nbucket_name = "${bucket}"\n`
  })
  
  // Adicionar variáveis
  const varsConfig = `\n[vars]\nJWT_SECRET = "CHANGE-THIS-IN-PRODUCTION"\n`
  
  // Inserir configurações antes do primeiro [vars] ou no final
  if (content.includes('[vars]')) {
    content = content.replace('[vars]', d1Config + r2Config + varsConfig)
  } else {
    content = content + d1Config + r2Config + varsConfig
  }
  
  fs.writeFileSync(wranglerPath, content)
  logSuccess('wrangler.toml atualizado')
}

// Configurar secrets
function configureSecrets() {
  log('\n🔐 Configurando secrets...')
  log('Execute manualmente após este script:')
  log('  wrangler secret put JWT_SECRET')
  log('  wrangler secret put NEXT_PUBLIC_SUPABASE_URL')
  log('  wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY (se ainda usar Supabase)')
}

// Configurar Pages
function configurePages() {
  log('\n📄 Configurando Cloudflare Pages...')
  log('O projeto será deployado via Next-on-Pages.')
  log('Comando para deploy manual:')
  log('  npm run build')
  log('  npx @cloudflare/next-on-pages deploy')
}

// Main
async function main() {
  log('🚀 Configurando Readr na Cloudflare\n')
  log('='.repeat(50))
  
  // Verificar pré-requisitos
  if (!checkWrangler()) process.exit(1)
  if (!checkCredentials()) process.exit(1)
  
  // Executar configurações
  createR2Buckets()
  const dbId = createD1Database()
  
  if (dbId) {
    executeSchema(dbId)
    configureWrangler(dbId)
  }
  
  configureSecrets()
  configurePages()
  
  log('\n' + '='.repeat(50))
  logSuccess('🎉 Configuração básica concluída!')
  log('\nPróximos passos:')
  log('1. Configure os secrets JWT_SECRET manualmente')
  log('2. Migre os dados do Supabase para D1')
  log('3. Mova arquivos do Storage para R2')
  log('4. Faça o deploy com: npm run build && npm run deploy:cloudflare')
}

main().catch(error => {
  logError(`Erro inesperado: ${error.message}`)
  process.exit(1)
})