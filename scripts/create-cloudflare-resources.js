#!/usr/bin/env node
/**
 * Cria recursos na Cloudflare via API diretamente
 * Não requer wrangler instalado
 */

import https from 'https'
import { URL } from 'url'
import fs from 'fs'
import dotenv from 'dotenv'

// Carregar .env.local
const envPath = 'scripts/.env.local'
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const CF_API_TOKEN = process.env.CF_API_TOKEN || process.env.Cf_Api_Token
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || process.env.Cf_Account_Id

// Configurações
const R2_BUCKETS = ['covers', 'avatars', 'uploads']
const D1_DATABASE_NAME = 'readr-db'

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

function logSuccess(msg) {
  console.log(`${colors.green}✅ ${msg}${colors.reset}`)
}

function logError(msg) {
  console.error(`${colors.red}❌ ${msg}${colors.reset}`)
}

// Função para fazer requisições HTTPS
function cloudflareRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/${endpoint}`)
    
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${CF_ACCOUNT_ID}/${endpoint}`,
      method,
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
    
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.success) resolve(json)
          else reject(new Error(json.errors?.map(e => e.message).join(', ') || 'Unknown error'))
        } catch (e) {
          reject(e)
        }
      })
    })
    
    req.on('error', reject)
    
    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

async function createR2Buckets() {
  log('\n📦 Criando buckets R2...', 'blue')
  
  for (const bucket of R2_BUCKETS) {
    try {
      await cloudflareRequest('PUT', `r2/buckets/${bucket}`)
      logSuccess(`Bucket R2 "${bucket}" criado`)
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        log(`Bucket "${bucket}" já existe`, 'yellow')
      } else {
        logError(`Erro bucket ${bucket}: ${error.message}`)
      }
    }
  }
}

async function listD1Databases() {
  try {
    const result = await cloudflareRequest('GET', 'd1/databases')
    return result.result || []
  } catch {
    return []
  }
}

async function createD1Database() {
  log('\n🗄️ Criando banco D1...', 'blue')
  
  try {
    const result = await cloudflareRequest('POST', 'd1/databases', {
      name: D1_DATABASE_NAME,
      location: 'auto'
    })
    logSuccess(`Banco D1 criado (ID: ${result.result.id})`)
    return result.result.id
  } catch (error) {
    if (error.message.includes('already exists')) {
      log(`Banco D1 "${D1_DATABASE_NAME}" já existe`, 'yellow')
    } else {
      logError(`Erro D1: ${error.message}`)
    }
    
    // Tentar encontrar ID existente
    const dbs = await listD1Databases()
    const existing = dbs.find(db => db.name === D1_DATABASE_NAME)
    if (existing) {
      logSuccess(`Usando D1 existente (ID: ${existing.id})`)
      return existing.id
    }
    return null
  }
}

async function main() {
  log('🚀 Configurando Readr na Cloudflare\n', 'green')
  log('='.repeat(50), 'green')
  
  if (!CF_API_TOKEN) {
    logError('CF_API_TOKEN não definido')
    process.exit(1)
  }
  if (!CF_ACCOUNT_ID) {
    logError('CF_ACCOUNT_ID não definido')
    process.exit(1)
  }
  
  logSuccess('Credenciais verificadas')
  
  await createR2Buckets()
  const dbId = await createD1Database()
  
  if (dbId) {
    // Atualizar wrangler.toml
    const wranglerPath = 'wrangler.toml'
    let content = fs.readFileSync(wranglerPath, 'utf-8')
    
    content = content.replace(/\[\[d1_databases\]\][^\[]*/g, '')
    content = content.replace(/\[\[r2_buckets\]\][^\[]*/g, '')
    content = content.replace(/JWT_SECRET[^\n]*\n/g, '')
    
    const d1Config = `\n[[d1_databases]]\nbinding = "DB"\nid = "${dbId}"\n`
    
    let r2Config = '\n[[r2_buckets]]\nbinding = "R2"\nbucket_name = "covers"\n'
    r2Config += '[[r2_buckets]]\nbinding = "R2_AVATARS"\nbucket_name = "avatars"\n'
    r2Config += '[[r2_buckets]]\nbinding = "R2_UPLOADS"\nbucket_name = "uploads"\n'
    
    const varsConfig = `\n[vars]\nJWT_SECRET = "CHANGE-THIS-IN-PRODUCTION"\n`
    
    content = content + d1Config + r2Config + varsConfig
    fs.writeFileSync(wranglerPath, content)
    logSuccess('wrangler.toml atualizado')
  }
  
  log('\n' + '='.repeat(50), 'green')
  logSuccess('🎉 Configuração concluída!', 'green')
  log('\nPróximos passos:', 'cyan')
  log('  1. wrangler secret put JWT_SECRET', 'yellow')
  log('  2. Migre dados do Supabase para D1', 'yellow')
  log('  3. npm run build', 'yellow')
  log('  4. npx @cloudflare/next-on-pages deploy', 'yellow')
}

main().catch(error => {
  logError(error.message)
  process.exit(1)
})