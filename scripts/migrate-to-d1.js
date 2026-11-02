#!/usr/bin/env node
/**
 * Script de migração Supabase -> Cloudflare D1
 * 
 * Uso: node scripts/migrate-to-d1.js
 * 
 * Requer: 
 * 1. Exportação de dados do Supabase em JSON/CSV
 * 2. Banco D1 já criado
 * 
 * Alternativa: usar a ferramenta de exportação do Supabase:
 * supabase db dump --file=dump.sql
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('=== Script de migração para Cloudflare D1 ===\n');

// Verificar se o D1 já foi criado
console.log('Passos necessários para concluir a migração:');
console.log('');
console.log('1. Criar os buckets no R2:');
console.log('   wrangler r2 bucket create covers');
console.log('   wrangler r2 bucket create avatars');
console.log('   wrangler r2 bucket create uploads');
console.log('');
console.log('2. Criar o banco D1:');
console.log('   wrangler d1 create readr-db');
console.log('   (copiar o binding ID para wrangler.toml)');
console.log('');
console.log('3. Executar o schema no D1:');
console.log('   wrangler d1 execute readr-db --file=supabase/schema-d1.sql');
console.log('');
console.log('4. Mover arquivos do Supabase Storage para R2:');
console.log('   wrangler r2 copy <source-bucket> covers -c <dest-config> --path <local-path>');
console.log('');
console.log('5. Substituir no código:');
console.log('   - @supabase/supabase-js por @cloudflare/d1 (ou usar fetch diretamente)');
console.log('   - @supabase/storage-js por @aws-sdk/client-s3');
console.log('   - Criar wrappers de autenticação com JWT');
console.log('');
console.log('⚠️  IMPORTANTE: A migração real requer:');
console.log('   - Código da API para autenticação (sem RLS do Postgres)');
console.log('   - Conversão de JSONB/ARRAY para JSON strings');
console.log('   - Funções SQL do Postgres convertidas para JavaScript/Workers');