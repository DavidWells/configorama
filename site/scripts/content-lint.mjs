import path from 'node:path'
import { firstParagraph, listMdxFiles, readPage, wordCount } from './content-utils.mjs'

const failures = []
const pages = listMdxFiles().map(readPage)

for (const page of pages) {
  const rel = path.relative(process.cwd(), page.filePath)
  const intro = firstParagraph(page.body)
  const isReference = isReferenceRoute(page.route)
  const isHome = page.route === '/'
  const isIntroGuide = page.route === '/guides/get-started'

  check(page.raw.startsWith('---\n'), rel, 'has frontmatter')
  check(wordCount(intro) >= 35 || isReference, rel, 'intro paragraph has orientation')
  check(/why|because|solves|exists to|useful|need|helps|purpose/i.test(page.body.slice(0, 1800)) || isReference, rel, 'states motivation early')
  check(/```mermaid|<FileTree|<Cards|graph [A-Z]+|sequenceDiagram/.test(page.body) || isReference, rel, 'has mental model')
  check(/```[a-zA-Z0-9]+/.test(page.body), rel, 'has language-tagged example')
  check(isHome || isReference || isIntroGuide || /Callout type="(warning|error|important)"|gotcha|pitfall|caveat|common mistake/i.test(page.body), rel, 'has pitfall or warning')
  check(isHome || countInternalLinks(page.body) >= 2 || isReference, rel, 'has cross-links')
  check(!hasPlaceholder(page.body), rel, 'has no placeholders')
}

function countInternalLinks(body) {
  return (body.match(/\]\((\/|\.\.?\/)[^)]+\)/g) || []).length
}

function isReferenceRoute(route) {
  return route === '/cli' ||
    route === '/api' ||
    route === '/variable-sources' ||
    route === '/filters-functions' ||
    route === '/security-policies' ||
    route === '/glossary' ||
    route.startsWith('/variables') ||
    route.startsWith('/schemas')
}

function check(condition, file, label) {
  if (!condition) failures.push(`${file}: ${label}`)
}

function hasPlaceholder(body) {
  const withoutAwsDynamicRefs = body.replace(/\{\{resolve:[^}]+}}/g, '')
  return /TODO|FIXME|XXX|lorem|\{\{/.test(withoutAwsDynamicRefs)
}

if (failures.length) {
  console.error('Content lint failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Content lint passed for ${pages.length} pages.`)
