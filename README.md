# Readr

Aplicativo social de leitura, importação e autoria construído sobre o repositório existente com Next.js 14 App Router, React 18, TypeScript strict, Tailwind CSS, Supabase, Zustand, `react-pageflip` e `next-intl`.

## Estado verificado em 02/08/2026

### Testes aprovados nesta rodada

- `npx tsc --noEmit`: aprovado após a migração estrutural do leitor.
- `npm run check:reader-translations`: 47 chaves do namespace `reader` validadas em PT/EN/ES.
- `npm run build`: aprovado com Next.js 14.2.35; 18 páginas geradas e as três APIs de autenticação reconhecidas.
- EPUB real ilustrado de domínio público, *The Tale of Peter Rabbit* (Project Gutenberg #14838): 2 capítulos, 96 parágrafos, 28 imagens internas, 3 headings, 2 divisores, 1 blockquote, 4 itens de lista, quebras manuais e capa de 169159 bytes preservados.
- EPUB real *Alice's Adventures in Wonderland* (Project Gutenberg #11): 14 seções, 821 parágrafos, headings, divisores, blockquote, listas e quebras manuais preservados.
- DOCX real gerado para aceite: headings, parágrafos, lista, quebra manual e imagem convertida para data URL aprovados.
- PDF real gerado para aceite: metadados, duas páginas, dois headings, três parágrafos reconstruídos e placeholder de imagem incorporada aprovados.
- PM2: processo `readr` online na porta 3000.
- `GET /`: HTTP 200.
- Console no dashboard e em `/settings`: nenhuma mensagem capturada.
- Supabase público com a chave anônima: `profiles`, `books` e `created_books` acessíveis; o projeto remoto possui 2 perfis, 1 importado e 1 autoral publicado no momento do teste.
- Busca local pelos nomes demonstrativos solicitados: nenhuma ocorrência no código, assets ou SQL. O único `51%` encontrado é um percentual CSS legítimo.

### Bloqueios comprovados

`SUPABASE_SERVICE_ROLE_KEY` não existe em `.env.local`, no shell nem em uma autenticação Vercel local. Por segurança ela não foi inventada, solicitada ao navegador ou prefixada com `NEXT_PUBLIC_`.

Consequências verificadas:

- `POST /api/auth/signup`: HTTP 503 com instrução para configurar a service role.
- `POST /api/auth/login`: HTTP 503 pela configuração server-side incompleta.
- cadastro, login automático, logout, login por e-mail/apelido, exclusão e cenário multiusuário real **não foram declarados aprovados**.
- `supabase/schema.sql` não pôde ser aplicado ao projeto remoto nesta rodada.
- o catálogo remoto ainda contém um importado chamado `Harry Potter The Complete Collection`; não há referência local a ele, mas removê-lo com segurança exige uma sessão proprietária ou service role. Portanto a limpeza remota não está concluída.

A CLI/token da Vercel também não está configurada no sandbox. O build está pronto para Vercel, mas nenhum deploy de produção foi falsamente declarado.

## Implementação atual

### Autenticação

- Cadastro com exatamente nome, apelido, e-mail e senha.
- Sem regra local de complexidade de senha; vale a política configurada no Supabase.
- Apelido normalizado e único case-insensitive por índice e validação server-side.
- ID público aleatório de oito dígitos com consulta de colisão.
- Criação via `admin.auth.admin.createUser({email_confirm: true})`.
- Login automático após cadastro no cliente.
- Login por e-mail ou apelido, com resolução case-insensitive em `account_aliases`.
- Service role usada apenas nas rotas Node.js server-side.
- Exclusão em `/api/auth/delete-account`: valida a sessão, remove arquivos do usuário nos três buckets e chama `admin.deleteUser`; as tabelas ligadas a `profiles/auth.users` usam cascata.

### Leitor

#### Decisões de conteúdo

- O formato intermediário usa `ReaderChapter` e blocos tipados: heading, paragraph, blockquote, list-item, divider e image.
- EPUB percorre `container.xml`, OPF, manifest, spine e `nav.xhtml`/NCX; resolve paths relativos e incorpora imagens internas sem achatar a estrutura.
- DOCX usa `mammoth.convertToHtml()` e converte imagens embutidas para data URLs.
- PDF usa `hasEOL`, posição vertical, altura/tamanho de fonte e mediana inferior para reconstruir linhas, parágrafos e headings; também consulta `getOutline()`. Páginas com imagem incorporada e pouco texto recebem snapshot quando o canvas está disponível ou placeholder explícito.
- Importação não corta mais o conteúdo em lotes fixos de 280 palavras. A paginação acontece no leitor, por blocos; somente blocos textuais longos são divididos.
- Conteúdo legado em `string[]` continua legível por conversão compatível no `ImportedBookSource`.

#### Experiência de leitura

- Conteúdo contínuo é repaginado conforme viewport, fonte, margens e espaçamento, preservando capítulos e âncora global.
- Capa entra como folha rígida inicial do page flip; `showCover` é ativado quando a janela inclui a capa.
- Heading de capítulo aparece apenas na primeira página correspondente; parágrafos, versos, citações, listas, divisores e imagens têm renderização semântica própria.
- `ResizeObserver` único é agrupado com `requestAnimationFrame`; não existe mais o teto de 580px.
- Páginas memoizadas e janela de oito páginas no `react-pageflip`; rolagem usa nove páginas com espaçadores.
- Chrome inicia visível, se oculta após 3 segundos, reabre por toque central e libera `100dvh` para o stage.
- Papel claro usa `#faf7f0`, textura mínima, show-through de 2–4% apenas em claro/sépia e sombras rasas; o tema escuro troca isso por glow sutil.
- Sete fontes reais são fornecidas por `next/font`, com preview e migração de preferências legadas.
- Seleção oferece copiar, quatro cores de destaque, nota, dicionário e compartilhamento. Destaques usam âncoras globais.
- Capítulos, miniaturas, busca e bookmarks continuam navegando pela mesma âncora após repaginação.

As colunas `reading_progress.anchor_offset` e `bookmarks.anchor_offset`, além da nova tabela privada `highlights` com RLS, índices e grants, estão no SQL local. O schema precisa ser aplicado remotamente antes de testar persistência ponta a ponta.

### Interface e configurações

- Tema global claro/escuro persistente por `data-theme`, com toggle no cabeçalho e controles em Configurações.
- Idioma PT/EN/ES sem reload e sem `MutationObserver`, usando `NextIntlClientProvider` e catálogos JSON.
- Leitor, navegação, autenticação e principais controles usam `useTranslations`; ainda há textos literais em telas extensas de biblioteca, detalhes e comunidade que devem ser migrados antes de afirmar cobertura integral.
- Perfil próprio mostra métricas, seguidores/seguindo e atalho para adicionar amigos.
- Contador de leitores é estável entre telas: zero mostra apenas olho discreto; valores positivos mostram olho preenchido e número; a regra global coral é `reads_count >= 10`, definida em `src/lib/popularity.ts`, sem “top 3” relativo.

## Rotas

| Rota | Função |
|---|---|
| `/` | Dashboard e continuar leitura |
| `/auth/signup` | Cadastro |
| `/auth/login` | Login por e-mail/apelido |
| `/library` | Estante pessoal |
| `/library/community?query=` | Catálogo público e filtros |
| `/library/created` | Livros autorais |
| `/community` | Pessoas e rankings |
| `/profile` | Perfil próprio e métricas |
| `/profile/[id]` | Perfil público |
| `/import` | Importação EPUB/PDF/DOCX |
| `/create` | Novo livro autoral |
| `/book/[id]/details?source=...&from=...` | Detalhes públicos e origem de navegação |
| `/book/[id]?source=...&from=...` | Leitor autenticado |
| `/book/[id]/manage` | Gerenciar importado próprio |
| `/book/[id]/edit` | Editar autoral próprio |
| `/settings` | Tema, idioma, padrões do leitor e exclusão |
| `/api/auth/signup` | Criação administrativa confirmada |
| `/api/auth/login` | Resolução do apelido e sessão |
| `/api/auth/delete-account` | Exclusão autenticada da conta |

## Dados e segurança

- **Auth:** Supabase Auth.
- **Postgres:** `profiles`, `account_aliases`, `books`, `created_books`, `chapters`, `reading_progress`, `book_reads`, `shelf_items`, `book_reactions`, `reviews`, `follows`, `activities`, `bookmarks`, `highlights`, `customization_settings`.
- **RLS:** leitura pública apenas onde prevista; escrita do proprietário; progresso, marcadores e destaques privados.
- **Grants:** visitantes não recebem `books.content`.
- **Storage:** `covers`/`avatars` públicos e `uploads` privado por usuário.
- **Segredos:** `.env.local`, `.vercel`, archives, caches, `.next` e `node_modules` são ignorados.

## Configuração

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

1. Configure as três variáveis, mantendo a service role somente no servidor.
2. Execute integralmente `supabase/schema.sql` no SQL Editor do projeto.
3. Reinicie o processo.
4. Execute os testes reais descritos abaixo antes de liberar produção.

## Testes de aceite ainda obrigatórios

Os testes estruturais locais de EPUB/PDF/DOCX foram aprovados. Screenshots do leitor autenticado nos breakpoints 375/820/1194/1440, chrome visível/oculto, três temas, seletor de fontes, popup de seleção, page curl e persistência ponta a ponta **não são declarados aprovados**, pois o login está bloqueado sem `SUPABASE_SERVICE_ROLE_KEY` e o schema remoto ainda não contém `highlights`/âncoras.

Depois de configurar a service role e aplicar o schema:

1. cadastrar uma conta, confirmar login automático, logout e logins por e-mail/apelido;
2. validar duplicidade case-insensitive de e-mail/apelido;
3. criar A e B; A importa/publica, B lê;
4. confirmar leitura única, proprietário sem incremento, progresso/Continue Reading e bloqueios de UI/RLS;
5. testar mudanças de tipografia e margem sem perder a âncora, capítulos, busca, miniaturas e bookmarks no banco;
6. produzir screenshots do leitor real em 375, 820, 1194 e 1440px, incluindo chrome visível/oculto, três temas, fontes, seleção, destaque/nota e page curl;
7. testar os fluxos `Início → Continue → leitor → X → Início` e `Biblioteca → detalhes → leitor → X → detalhes → X → Biblioteca`;
8. remover o registro remoto demonstrativo identificado e repetir a busca final.

## Desenvolvimento e preview

```bash
npm install
npx tsc --noEmit
npm run build
pm2 start ecosystem.config.cjs
pm2 logs readr --nostream
```

Preview verificado nesta rodada:

- https://3000-i400wv8v5fyi7cqg0zhck-3844e1b6.sandbox.novita.ai

## Vercel

O destino final continua sendo Vercel. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` em Production/Preview/Development, execute o schema e inclua a URL implantada na configuração de URLs do Supabase Auth.

Este repositório Next.js não usa o deploy Cloudflare/Hono de um clique. Builds devem ser feitos em Linux/CI.

## Auditoria de dependências

`npm audit` encontrou 17 avisos: 16 altos na cadeia Next 14/ESLint e 1 moderado em `next-intl`. As correções automáticas propostas exigem mudanças maiores para Next 16, ESLint 10 e `next-intl` 4. O upgrade não foi aplicado porque o requisito desta entrega mantém Next.js 14/React 18 e uma atualização forçada alteraria a arquitetura sem testes de regressão. Próximo passo recomendado: planejar migração isolada para uma versão suportada, começando por Next 15, e repetir toda a matriz de aceite.

## Limitações

- PDF composto apenas por imagens requer OCR; imagens detectadas sem extração viável recebem placeholder explícito.
- EPUB com DRM não é suportado.
- Conteúdo dos livros nunca é traduzido pela interface.
- Não considerar autenticação, RLS multiusuário, exclusão ou deploy Vercel aprovados até a remoção dos bloqueios documentados.
