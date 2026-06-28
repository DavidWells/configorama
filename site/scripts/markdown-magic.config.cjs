const fs = require('node:fs')
const path = require('node:path')
const { repoRoot, examples } = require('./docs-example-registry.cjs')

const secretPattern = /(api[_-]?key|password|passwd|secret|token|credential)/i

function getExample(options = {}) {
  const id = options.id
  if (!id) throw new Error('CONFIGORAMA_EXAMPLE requires id="example-id"')

  const entry = examples[id]
  if (!entry) throw new Error(`Unknown docs example id "${id}"`)

  const src = options.src || entry.src
  const marker = options.marker || entry.marker || id
  const lang = options.lang || entry.lang || languageFromPath(src)
  const filePath = path.resolve(repoRoot, src)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Docs example "${id}" source does not exist: ${src}`)
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const snippet = extractMarker(content, marker, src)
  const rendered = redact(dedent(snippet.trim()), options.redact !== 'false')
  return fence(rendered, lang)
}

function getResult(options = {}) {
  return getExample(options)
}

function getTestLink(options = {}) {
  const id = options.id
  if (!id || !examples[id]) return ''
  return `{/* source: ${examples[id].src} */}`
}

function extractMarker(content, marker, src) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const startIndex = lines.findIndex(line => markerLine(line, 'start', marker))
  if (startIndex === -1) throw new Error(`Missing docs:start ${marker} in ${src}`)

  const endIndex = lines.findIndex((line, index) => index > startIndex && markerLine(line, 'end', marker))
  if (endIndex === -1) throw new Error(`Missing docs:end ${marker} in ${src}`)

  return lines.slice(startIndex + 1, endIndex).join('\n')
}

function markerLine(line, kind, marker) {
  const normalized = line
    .trim()
    .replace(/^<!--\s*/, '')
    .replace(/\s*-->\s*$/, '')
    .replace(/^\/\*\s*/, '')
    .replace(/\s*\*\/\s*$/, '')
    .replace(/^\/\/\s*/, '')
    .replace(/^#\s*/, '')

  return normalized === `docs:${kind} ${marker}`
}

function dedent(value) {
  const lines = value.replace(/\r\n/g, '\n').split('\n')
  const indents = lines
    .filter(line => line.trim())
    .map(line => line.match(/^\s*/)[0].length)
  const min = indents.length ? Math.min(...indents) : 0
  return lines.map(line => line.slice(min)).join('\n')
}

function redact(value, enabled) {
  if (!enabled) return value

  return value
    .split('\n')
    .map(line => {
      if (!secretPattern.test(line)) return line
      return line.replace(/(:\s*)(['"]?)[^'",\]}#\s]+(['"]?)/, '$1$2[redacted]$3')
    })
    .join('\n')
}

function fence(value, lang) {
  return `\`\`\`${lang}\n${value}\n\`\`\``
}

function languageFromPath(src) {
  const ext = path.extname(src).replace(/^\./, '')
  if (ext === 'yml') return 'yaml'
  if (ext === 'mjs' || ext === 'cjs') return 'js'
  return ext || 'text'
}

module.exports = {
  files: 'content/**/*.mdx',
  syntax: 'mdx',
  open: 'docs',
  close: '/docs',
  failOnMissingTransforms: true,
  transforms: {
    CONFIGORAMA_EXAMPLE: ({ options }) => getExample(options),
    CONFIGORAMA_RESULT: ({ options }) => getResult(options),
    CONFIGORAMA_TEST_LINK: ({ options }) => getTestLink(options)
  }
}
