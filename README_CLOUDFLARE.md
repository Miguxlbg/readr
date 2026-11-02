# Readr — Cloudflare (100% Workers + D1)

> URL de produção: **https://readr.bragamiguel018.workers.dev**
> Stack: Next.js 15 no Cloudflare **Workers** (via OpenNext) + **D1** único (dados + arquivos).
> Sem Supabase. Sem R2. Sem KV.

## Arquitetura

| Antes (Supabase) | Depois (Cloudflare) |
|---|---|
| Supabase Auth (triggers/admin) | JWT HS256 (WebCrypto) em cookie httpOnly + senha PBKDF2-310k no navegador |
| PostgreSQL | D1 `readr` (SQLite) |
| Supabase Storage (3 buckets) | D1 (`files` + `file_chunks`, chunks de 512 KB) servidos por `/api/files/<id>` |
| RLS do Postgres | Verificação de sessão + SQL com `user_id` no servidor (`src/server/store.ts`) |
| `@/lib/data` → supabase-js no navegador | `@/lib/data` → `POST /api/rpc` com sessão por cookie |

## Rotas do backend

```
POST  /api/auth/kdf       → salt PBKDF2 do usuário (salt-isca se não existir)
POST  /api/auth/signup    → cria conta (e-mail/apelido únicos) + cookie de sessão
POST  /api/auth/login     → verifica sha256(salt‖k) e emite cookie
POST  /api/auth/logout    → limpa o cookie
GET   /api/auth/session   → perfil do usuário logado (ou null)
DELETE /api/auth/delete-account → exclui conta, filhos e arquivos
POST  /api/rpc            → dispatcher de todas as operações de dados ({ op, args })
POST  /api/files/upload   → upload multipart (highlight-color/avatares/livros) para o D1
GET   /api/files/<id>     → bytes do arquivo (capas/avatares públicos; livro privado do dono)
```

Todas as operações de dados passam por `/api/rpc`; os handlers vivem em `src/server/store.ts`
e a autorização é pelo `sub` do JWT — o `user_id` vindo do cliente **nunca é confiado**.

## Desenvolvimento local

```bash
npm install                 # dependências
npx wrangler d1 execute readr --local --file=d1/schema.sql   # schema no D1 local (miniflare)
npm run dev                 # next dev — bindings D1 locais chegam via initOpenNextCloudflareForDev
npm run cf-typegen          # re-gera cloudflare-env.d.ts após mudar wrangler.jsonc
npm run preview             # build + preview no runtime real do Workers (miniflare)
```

Secret local: `.dev.vars` (ignorado pelo git) contém `JWT_SECRET` e `NEXTJS_ENV=development`.

## Deploy

```bash
npm run deploy              # opennextjs-cloudflare build && deploy
```

Após o primeiro `deploy`, defina o secret (uma única vez por workspace):

```bash
wrangler secret put JWT_SECRET   # cole/pipe um segredo forte
```

Trocar o secret invalida as sessões ativas (todos os logouts).

## Aplicar mudanças de schema

Edite `d1/schema.sql` (idempotente) e rode:

```bash
wrangler d1 execute readr --remote --file=d1/schema.sql
```

## Limites conhecidos

- **1 MB por linha no D1**: o conteúdo dos livros e os bytes dos arquivos são divididos em chunks
  (200 KB texto / 512 KB binários). Livro original aceito até 25 MB; acima disso o livro entra
  sem backup do arquivo bruto (o conteúdo renderizado continua funcionando).
- **Leituras de capas/avatares** são URLs `/api/files/<id>` — cacheadas com `immutable` no browser.
- A conta antiga do Supabase **não migra silenciosamente**: usuários precisam se cadastrar de novo
  (não existem credenciais da era Supabase para migrar dados).
