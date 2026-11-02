#!/usr/bin/env node
/**
 * Deploy automático para Cloudflare Pages
 * 
 * Uso: CF_API_TOKEN=xxx CF_ACCOUNT_ID=xxx CF_ZONE_ID=xxx node scripts/deploy-cloudflare.js
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const PROJECT_NAME = 'readr'

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

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { 
      encoding: 'utf-8', 
      stdio: options.silent ? 'pipe' : 'inherit',
      timeout: 300000
    })
  } catch (error) {
    if (!options.allowFail) throw error
    return null
  }
}

async function main() {
  log(`\n🚀 Deploy automático para Cloudflare - ${PROJECT_NAME}\n`, 'green')
  
  // Verificar variáveis de ambiente
  const token = process.env.CF_API_TOKEN
  const accountId = process.env.CF_ACCOUNT_ID
  const zoneId = process.env.CF_ZONE_ID
  
  if (!token || !accountId) {
    log('❌ CF_API_TOKEN e CF_ACCOUNT_ID são obrigatórios', 'red')
    log('Exemplo: CF_API_TOKEN=xxx CF_ACCOUNT_ID=xxx node scripts/deploy-cloudflare.js', 'yellow')
    process.exit(1)
  }
  
  // Passo 1: Build
  log('📦 Passo 1/4: Executando build...', 'blue')
  run('npm run build', { allowFail: false })
  log('✅ Build concluído', 'green')
  
  // Passo 2: Verificar .vercel/output/static
  log('🔍 Passo 2/4: Verificando output do build...', 'blue')
  const outputDir = '.vercel/output/static'
  if (!fs.existsSync(outputDir)) {
    log(`❌ Diretório de output não encontrado: ${outputDir}`, 'red')
    process.exit(1)
  }
  log('✅ Output encontrado', 'green')
  
  // Passo 3: Deploy
  log('🚀 Passo 3/4: Fazendo deploy...', 'blue')
  
  const deployCmd = [
    'npx @cloudflare/next-on-pages',
    'deploy',
    '--project-name', PROJECT_NAME,
    '--account-id', accountId
  ].join(' ')
  
  try {
    const result = execSync(deployCmd, { encoding: 'utf-8', timeout: 300000 })
    log('✅ Deploy concluído!', 'green')
    
    // Extrair URL do deploy
    const urlMatch = result.match(/https?:\/\/[^\s]+/)
    if (urlMatch) {
      log(`🌐 URL: ${urlMatch[0]}`, 'blue')
    }
    
    if (zoneId) {
      // Passo 4: Configurar DNS (se zoneId fornecido)
      log('🔗 Passo 4/4: Verificando DNS...', 'blue')
      log('⚠️ Configure manualmente o CNAME apontando para o domínio Cloudflare Pages', 'yellow')
    } else {
      log('✅ Deploy concluído sem configuração de domínio custom', 'green')
      log('Para domínio custom, adicione CF_ZONE_ID e configure CNAME', 'yellow')
    }
    
  } catch (error) {
    log('❌ Erro no deploy:', 'red')
    console.error(error.message)
    process.exit(1)
  }
  
  log('\n' + '='.repeat(50), 'green')
  log('🎉 Deploy concluído com sucesso!', 'green')
  log(`\n💡 Próximos passos:`, 'blue')
  log('  1. Verifique o site no URL acima', 'blue')
  log('  2. Configure variáveis de ambiente no painel Cloudflare', 'blue')
  log('  3. Monitore em https://dash.cloudflare.com/analytics', 'blue')
}

main().catch(error => {
  log('❌ Erro crítico:', 'red')
  console.error(error.message)
  process.exit(1)
})