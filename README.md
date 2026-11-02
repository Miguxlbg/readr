# Readr

Aplicativo social de leitura: importe EPUB/PDF/DOCX, escreva livros autorais, leia com page flip,
destaque trechos e acompanhe amigos. Next.js no **Cloudflare Workers**, todos os dados e arquivos
em um só banco: **D1**. Sem Supabase, sem R2, sem KV.

Guia de operação detalhado (deploy, schema, limites): [`README_CLOUDFLARE.md`](./README_CLOUDFLARE.md).

## Stack

- Next.js **15.5.28** (App Router, React 18, TypeScript strict) no Cloudflare **Workers** via `@opennextjs/cloudflare`
- **D1** (SQLite) — dados relacionais e armazenamento de arquivos em chunks
- Autenticação própria: JWT HS256 em cookie httpOnly; **PBKDF2 (310 mil iterações)** derivado no navegador
- Tailwind CSS, next-intl (PT/EN/ES), Zustand, react-pageflip, pdfjs-dist, mammoth, jszip

## Como rodar local

```bash
npm install
npx wrangler d1 execute readr --local --file=d1/schema.sql   # schema no D1 local (miniflare)
npm run dev        # http://localhost:3000 — bindings D1 locais via initOpenNextCloudflareForDev
```

Secret local vai em `.dev.vars` (ignorado pelo git): `JWT_SECRET=...`.

## Como publicar

```bash
npm run deploy                          # opennextjs-cloudflare build && deploy
npx wrangler secret put JWT_SECRET      # uma vez; trocar invalida sessões ativas
npx wrangler d1 execute readr --remote --file=d1/schema.sql   # aplicar schema
```

Produção atual: **https://readr.bragamiguel018.workers.dev**

## Rotas

| Rota | Função |
|---|---|
| `/` | Dashboard e continuar leitura |
| `/auth/signup`, `/auth/login` | Cadastro e login (e-mail ou apelido) |
| `/library`, `/library/community`, `/library/created` | Estante, catálogo público, autorais |
| `/community` | Pessoas e rankings |
| `/profile`, `/profile/[id]` | Perfil próprio e público |
| `/import`, `/create` | Importação de arquivos e criação autoral |
| `/book/[id]?source=...` | Leitor (page flip) |
| `/book/[id]/details`, `/manage`, `/edit` | Detalhes, importado próprio, autoral próprio |
| `/settings` | Tema, idioma, padrões do leitor, exclusão de conta |

### API

| Endpoint | Função |
|---|---|
| `POST /api/auth/kdf` | Devolve o salt PBKDF2 do usuário (salt-isca se a conta não existir) |
| `POST /api/auth/signup` / `login` | Cria/valida conta e emite o cookie de sessão |
| `POST /api/auth/logout`, `GET /api/auth/session` | Encerra sessão; perfil logado |
| `DELETE /api/auth/delete-account` | Exclui conta, dados filhos e arquivos |
| `POST /api/rpc` | Dispatcher de todas as operações de dados (`{ op, args }`) |
| `POST /api/files/upload`, `GET /api/files/[id]` | Upload e leitura de arquivos (D1) |

## Segurança

- A sessão é o **JWT do cookie httpOnly**; o `user_id` enviado pelo cliente nunca é confiado.
- Toda autorização vive no servidor, em `src/server/store.ts` (a antiga RLS do Supabase virou
  verificação de sessão + SQL filtrado por `user_id`).
- A senha nunca sai do navegador em claro: o cliente deriva `k` via PBKDF2 e o servidor guarda
  apenas `sha256(salt ‖ k)`.
- Ops de dados são divididas em `PUBLIC_OPS` (leitura pública) e `PRIVATE_OPS` (exigem sessão).

## Limitações conhecidas

- Limite de **1 MB por linha no D1**: conteúdo de livros e bytes de arquivos são divididos em chunks
  (texto 200 KB, binários 512 KB).
- Livro original (backup do arquivo bruto) até **25 MB**; acima disso o livro entra sem backup,
  com o conteúdo renderizado funcionando normalmente.
- **Não há migração de dados da era Supabase** (não existem credenciais do projeto antigo):
  usuários precisam se cadastrar novamente.
- EPUB com DRM não é suportado; PDF composto apenas por imagens recebe placeholder explicito.
