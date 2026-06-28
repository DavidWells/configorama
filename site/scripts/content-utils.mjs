import fs from 'node:fs'
import path from 'node:path'

export const siteRoot = path.resolve(new URL('..', import.meta.url).pathname)
export const contentRoot = path.join(siteRoot, 'content')

export function listMdxFiles(dir = contentRoot) {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listMdxFiles(fullPath))
    else if (entry.isFile() && entry.name.endsWith('.mdx')) files.push(fullPath)
  }
  return files.sort()
}

export function readPage(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const frontmatterMatch = raw.match(/^---\n[\s\S]*?\n---\n?/)
  const body = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw
  const route = routeForFile(filePath)
  return { filePath, raw, body, route }
}

export function routeForFile(filePath) {
  const rel = path.relative(contentRoot, filePath).replace(/\\/g, '/').replace(/\.mdx$/, '')
  if (rel === 'index') return '/'
  return '/' + rel.replace(/\/index$/, '')
}

export function firstParagraph(body) {
  const withoutImports = body
    .replace(/^import .*$/gm, '')
    .replace(/^# .*$/m, '')
    .trim()
  const block = withoutImports.split(/\n\s*\n/).find(part => part.trim() && !part.trim().startsWith('<'))
  return (block || '').replace(/\s+/g, ' ').trim()
}

export function wordCount(text) {
  return (text.match(/\b[\w'-]+\b/g) || []).length
}
