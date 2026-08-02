import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const componentDir = path.join(root, 'src/components/reader')
const files = fs.readdirSync(componentDir).filter((name) => /\.[jt]sx?$/.test(name))
const keys = new Set()
for (const file of files) {
  const source = fs.readFileSync(path.join(componentDir, file), 'utf8')
  for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]\s*\)/g)) keys.add(match[1])
}

let failed = false
for (const locale of ['pt', 'en', 'es']) {
  const messages = JSON.parse(fs.readFileSync(path.join(root, `src/messages/${locale}.json`), 'utf8'))
  const missing = [...keys].filter((key) => !(key in (messages.reader || {})))
  if (missing.length) {
    failed = true
    console.error(`${locale}: chaves ausentes: ${missing.join(', ')}`)
  } else {
    console.log(`${locale}: ${keys.size} chaves do leitor validadas`)
  }
}
if (failed) process.exit(1)
