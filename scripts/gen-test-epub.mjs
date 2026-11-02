// Gera um EPUB mínimo e válido para testes do fluxo de importação do Readr.
// Uso: node scripts/gen-test-epub.mjs <caminho-de-saida.epub>
import JSZip from 'jszip'
import { writeFileSync } from 'node:fs'

const outPath = process.argv[2] || 'teste-readr.epub'
const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`

const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:11111111-2222-3333-4444-555555555555</dc:identifier>
    <dc:title>Livro de Teste do Readr</dc:title>
    <dc:creator>Autor de Teste</dc:creator>
    <dc:language>pt-BR</dc:language>
    <dc:publisher>Editora Fantasma</dc:publisher>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cap1" href="cap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="cap2" href="cap2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="cap1"/><itemref idref="cap2"/></spine>
</package>`

const nav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><meta charset="utf-8"/><title>Sumário</title></head>
<body><nav epub:type="toc"><h1>Sumário</h1><ol><li><a href="cap1.xhtml">O Começo</a></li><li><a href="cap2.xhtml">O Fim</a></li></ol></nav></body></html>`

const chapter = (title, body) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>${title}</title></head>
<body><h1>${title}</h1>${body}</body></html>`

const filler = '<p>' + 'Palavras de teste '.repeat(200) + '</p>'
const cap1 = chapter('O Começo', '<p>Aqui começa a história de teste do importador.</p>' + filler)
const cap2 = chapter('O Fim', '<blockquote>Uma citação de encerramento.</blockquote><ul><li>Item de lista um</li><li>Item de lista dois</li></ul>' + filler + '<p>Fim.</p>')

const cover = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAKklEQVR4nO3BAQ0AAADCoPdMbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAPBmiQEAAbA7nWkAAAAASUVORK5CYII=',
), (c) => c.charCodeAt(0))

const zip = new JSZip()
// mimetype deve ser o primeiro arquivo, sem compressão
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
zip.file('META-INF/container.xml', container)
zip.file('OEBPS/content.opf', opf)
zip.file('OEBPS/nav.xhtml', nav)
zip.file('OEBPS/cap1.xhtml', cap1)
zip.file('OEBPS/cap2.xhtml', cap2)
zip.file('OEBPS/capa.png', cover)

zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' }).then((buffer) => {
  writeFileSync(outPath, buffer)
  console.log(`EPUB gerado: ${outPath} (${buffer.length} bytes)`)
})
