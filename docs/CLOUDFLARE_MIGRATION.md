# Migração: Supabase → Cloudflare (registro real)

Este documento registra a migração efetivamente executada do Readr para 100% Cloudflare.
Estado final: aplicação servida por **Workers** (OpenNext), todos os dados e arquivos em **D1**.

Decisão do dono do projeto: **sem R2, sem Supabase — apenas Cloudflare**. O armazenamento de
arquivos (capas, avatares, livro bruto) vive em D1, nas tabelas `files` / `file_chunks`.

## O que migramos

| Recurso | Antes (Supabase) | Depois (Cloudflare) |
|---|---|---|
| Banco | PostgreSQL | D1 `readr` (SQLite), 17 tabelas |
| Auth | Supabase Auth + service role | JWT HS256 (WebCrypto) em cookie httpOnly |
| Hash de senha | bcrypt no servidor | PBKDF2-SHA256, 310 iterações ×1.000, no navegador |
| Storage | 3 buckets (covers/avatars/uploads) | D1 `files` + `file_chunks` + rota `/api/files/[id]` |
| RLS | Policies no Postgres | Verificação de sessão + SQL filtrado em `src/server/store.ts` |
| Cliente de dados | supabase-js no navegador | `fetch('/api/rpc')` em `src/lib/data.ts` |
| Hospedagem | Vercel/PM2 | Cloudflare Workers via `@opennextjs/cloudflare` |

## Arquitetura nova

- `POST /api/rpc` é o único dispatcher de dados: `{ op, args }`; handlers em `src/server/store.ts`,
  separados em `PUBLIC_OPS` e `PRIVATE_OPS`.
- Credencial do cliente nunca é usada: o `sub` do JWT define o usuário; argumentos `user_id` chegam
  mas são ignorados.
- Login em 2 roundtrips: `POST /api/auth/kdf` (devolve salt; conta inexistente recebe salt-isca
  derivada do identificador, evitando enumeração) → derivação no navegador → `POST /api/auth/login`.
- Arquivos: até 25 MB (livro) / 4 MB (capas e avatares), divididos em chunks de 512 KB, servidos
  com cache `immutable` quando públicos.

## O que foi feito, em ordem

1. `package.json`: removidos supabase, next-on-pages, jsonwebtoken, bcryptjs, aws-sdk; adicionado
   `@opennextjs/cloudflare`; Next.js atualizado para **15.5.28** (patch do CVE-2025-66478).
2. Config: `wrangler.jsonc` (binding D1 `DB`, sem R2), `open-next.config.ts`, `next.config.mjs`
   com `initOpenNextCloudflareForDev()`, `.dev.vars`, `public/_headers`, `.env.example`.
   Removido o `wrangler.toml` antigo.
3. Código morto removido: `src/lib/supabase/`, `src/lib/d1/`, `db-client.ts`,
   `data-cloudflare.ts`, `cloudflare-auth.ts`, `CLOUDFLARE_SETUP_GUIDE.md` (guias da tentativa
   anterior com caminhos e planos que nunca existiram).
4. Schema (`d1/schema.sql`, idempotente) aplicado no D1 remoto — o schema parcial deixado por uma
   sessão anterior (com `auth_users` e `profiles` sem e-mail) foi derrubado: 0 usuários e 0 livros.
   A tabela interna `_cf_KV` permaneceu intacta.
5. Backend completo: `src/server/{auth,store}.ts` + rotas `/api/rpc`, `/api/auth/*`,
   `/api/files/*`.
6. Cliente: `src/lib/data.ts` reescrito (mesmas assinaturas), `src/lib/auth-client.ts` novo,
   `ProfileProvider`, `LoginForm`, `SignupForm`, settings e perfil adaptados.
7. Ajustes Next 15: `params` agora `Promise<{id:string}>` nas rotas dinâmicas servidoras.
8. Typecheck e build limpos; deploy publicado; secret `JWT_SECRET` configurado em produção.

## Validação (produção, 02/11/2026)

- `GET /` 200 · `/api/auth/kdf` 200 (salt-isca) · signup 200 criou perfil no D1
- RPC autenticado (`library_mine`) 200 · `/api/auth/session` 200 com cookie
- Senha errada → 401 · RPC público (`library_public`) 200
- URL: https://readr.bragamiguel018.workers.dev

Teste de navegador real (cadastro pela UI, exercitando o PBKDF2 no browser) executado com
Playwright; console limpo e fluxo cadastro → sessão funcionando.

## Dados antigos

Não existe migração de dados: o D1 remoto herdado estava sem usuários/livros e as credenciais do
Supabase antigo não existem em lugar algum do repositório. Quem tinha conta precisa se cadastrar
de novo.

## Próximos passos possíveis

- [ ] Domínio custom (opcional)
- [ ] Rate limit nos endpoints de auth (ex.: Turnstile em signup)
- [ ] Backup periódico do D1 (Time Travel cobre 30 dias)
