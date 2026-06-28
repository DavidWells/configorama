import fs from 'node:fs'
import path from 'node:path'
import { contentRoot, listMdxFiles, readPage } from './content-utils.mjs'

const pages = listMdxFiles().map(readPage)
const routes = new Set(pages.map(page => page.route))
const failures = []

for (const page of pages) {
  const links = [...page.raw.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1])
  for (const link of links) {
    if (/^(https?:|mailto:|#)/.test(link)) continue
    if (link.startsWith('/')) {
      const clean = normalizeRoute(link)
      if (!routes.has(clean)) failures.push(`${page.route}: missing route ${link}`)
      continue
    }

    const targetPath = path.resolve(path.dirname(page.filePath), link)
    const mdxPath = targetPath.endsWith('.mdx') ? targetPath : `${targetPath}.mdx`
    const indexPath = path.join(targetPath, 'index.mdx')
    if (!fs.existsSync(mdxPath) && !fs.existsSync(indexPath)) {
      failures.push(`${page.route}: missing relative link ${link}`)
    }
  }
}

function normalizeRoute(link) {
  const withoutHash = link.split('#')[0].replace(/\/$/, '')
  if (!withoutHash) return '/'
  return withoutHash
}

if (failures.length) {
  console.error('Link check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Link check passed for ${routes.size} routes under ${contentRoot}.`)
