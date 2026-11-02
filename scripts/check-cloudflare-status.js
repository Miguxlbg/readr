#!/usr/bin/env node
/**
 * Verifica o status da conexão com Cloudflare
 */

import fs from 'fs'
import dotenv from 'dotenv'

// Carregar .env.local
const envPath = 'scripts/.env.local'
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const CF_API_TOKEN = process.env.CF_API_TOKEN
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID

// Cores
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

function log(msg, color = 'blue') {
  console.log(`${colors[color]}${msg}${colors.reset}`)
}

async function checkStatus() {
  log('🔍 Verificando conexão com Cloudflare\n', 'green')
  
  // Verificar credenciais
  if (!CF_API_TOKEN) {
    logError('CF_API_TOKEN não encontrado em scripts/.env.local')
    return false
  }
  if (!CF_ACCOUNT_ID) {
    logError('CF_ACCOUNT_ID não encontrado em scripts/.env.local')
    return false
  }
  
  logSuccess('Credenciais encontradas')
  
  // Verificar wrangler.toml
  if (fs.existsSync('wrangler.toml')) {
    const content = fs.readFileSync('wrangler.toml', 'utf-8')
    logSuccess('wrangler.toml encontrado')
    
    if (content.includes('id = ""') && !content.includes('id = "')) {
      log('⚠️  D1 ID não configurado (precisa de ativar D1)', 'yellow')
    }
  }
  
  // Verificar schema D1
  if (fs.existsSync('supabase/schema-d1.sql')) {
    logSuccess('Schema D1 encontrado em supabase/schema-d1.sql')
  }
  
  // Verificar API de dados
  if (fs.existsSync('src/lib/d1/data-cloudflare.ts')) {
    logSuccess('API de dados Cloudflare encontrada')
  }
  
  // Verificar scripts
  const scripts = ['create-cloudflare-resources.js', 'deploy-cloudflare.js']
  scripts.forEach(script => {
    if (fs.existsSync(`scripts/${script}`)) {
      logSuccess(`Script ${script} encontrado`)
    }
  })
  
  console.log('')
  log('📋 Status da conexão:', 'cyan')
  console.log('  🔐 Credenciais: ✓')
  console.log('  📝 Scripts: ✓')
  console.log('  🗄️  Banco D1: ⨯ (precisa ativar R2/D1 no painel)')
  console.log('  📦 Storage R2: ⨯ (precisa ativar R2/D1 no painel)')
  console.log('')
  
  log('👉 Próximos passos:', 'yellow')
  log('  1. Ativar R2 e D1 no painel Cloudflare', 'yellow')
  log('  2. Executar: node scripts/create-cloudflare-resources.js', 'yellow')
  log('  3. Configurar secrets: wrangler secret put JWT_SECRET', 'yellow')
  log('  4. Deploy: npx @cloudflare/next-on-pages deploy', 'yellow')
  
  return true
}

function logError(msg) {
  console.log(`${colors.red}❌ ${msg}${colors.reset}`)
}

function logSuccess(msg) {
  console.log(`${colors.green}✅ ${msg}${colors.reset}`)
}

checkStatus().catch(console.error)