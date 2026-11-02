# Configuração automática do Readr na Cloudflare
# Execute com: powershell -file scripts/auto-setup.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 Configurando Readr na Cloudflare" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green

# Criar buckets R2
Write-Host "`n📦 Criando buckets R2..." -ForegroundColor Blue

$r2Buckets = @("covers", "avatars", "uploads")
foreach ($bucket in $r2Buckets) {
    try {
        & npx wrangler r2 bucket create $bucket
        Write-Host "✅ Bucket '$bucket' criado" -ForegroundColor Green
    } catch {
        Write-Host "Bucket '$bucket' já existe ou erro" -ForegroundColor Yellow
    }
}

# Criar banco D1
Write-Host "`n🗄️ Criando banco D1..." -ForegroundColor Blue

try {
    $d1Output = & npx wrangler d1 create readr-db 2>&1
    Write-Host "✅ Banco D1 criado" -ForegroundColor Green
} catch {
    Write-Host "Banco D1 já existe" -ForegroundColor Yellow
}

# Obter ID do D1
try {
    $d1List = & npx wrangler d1 list 2>&1
    $dbIdMatch = $d1List -match "readr-db\s+([a-f0-9-]+)"
    if ($Matches[1]) {
        $dbId = $Matches[1]
        Write-Host "D1 ID: $dbId" -ForegroundColor Cyan
    }
} catch {
    $dbId = ""
}

# Executar schema D1
Write-Host "`n📝 Executando schema D1..." -ForegroundColor Blue

if (Test-Path "supabase/schema-d1.sql") {
    try {
        & npx wrangler d1 execute readr-db --file=supabase/schema-d1.sql
        Write-Host "✅ Schema executado com sucesso" -ForegroundColor Green
    } catch {
        Write-Host "❌ Erro ao executar schema: $_" -ForegroundColor Red
    }
} else {
    Write-Host "❌ Schema não encontrado em supabase/schema-d1.sql" -ForegroundColor Red
}

# Atualizar wrangler.toml
Write-Host "`n⚙️ Atualizando wrangler.toml..." -ForegroundColor Blue

$wranglerPath = "wrangler.toml"
$content = Get-Content $wranglerPath -Raw

# Limpar configurações antigas
$content = $content -replace '\[\[d1_databases\]\][^\[]*', ''
$content = $content -replace '\[\[r2_buckets\]\][^\[]*', ''
$content = $content -replace 'JWT_SECRET[^\n]*\n', ''

# Adicionar novas configurações
$d1Config = if ($dbId) {
    "`n[[d1_databases]]`nbinding = `"DB`"`n`id = `"$dbId`"`n"
} else { "" }

$r2Config = "`n[[r2_buckets]]`nbinding = `"R2`"`nbucket_name = `"covers`"`n"
$r2Config += "[[r2_buckets]]`nbinding = `"R2_AVATARS`"`nbucket_name = `"avatars`"`n"
$r2Config += "[[r2_buckets]]`nbinding = `"R2_UPLOADS`"`nbucket_name = `"uploads`"`n"

$varsConfig = "`n[vars]`nJWT_SECRET = `"CHANGE-THIS-IN-PRODUCTION`"`n"

$newContent = $content + $d1Config + $r2Config + $varsConfig
Set-Content $wranglerPath $newContent

Write-Host "✅ wrangler.toml atualizado" -ForegroundColor Green

Write-Host "`n" + "=".Repeat(50) -ForegroundColor Green
Write-Host "🎉 Configuração básica concluída!" -ForegroundColor Green
Write-Host "" -ForegroundColor Cyan
Write-Host "Próximos passos:" -ForegroundColor Yellow
Write-Host "  1. Configure secrets: wrangler secret put JWT_SECRET" -ForegroundColor Yellow
Write-Host "  2. Configure secrets: wrangler secret put NEXT_PUBLIC_SUPABASE_URL" -ForegroundColor Yellow
Write-Host "  3. Configure secrets: wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY" -ForegroundColor Yellow
Write-Host "  4. Deploy: npm run build; npm run deploy:cloudflare" -ForegroundColor Yellow