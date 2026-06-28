import { listMdxFiles, readPage } from './content-utils.mjs'

const pages = listMdxFiles().map(readPage)
const bySection = new Map()

for (const page of pages) {
  const section = page.route === '/' ? 'home' : page.route.split('/')[1]
  bySection.set(section, (bySection.get(section) || 0) + 1)
}

console.log(JSON.stringify({
  schemaVersion: 1,
  pages: pages.length,
  sections: Object.fromEntries([...bySection.entries()].sort(([a], [b]) => a.localeCompare(b))),
  routes: pages.map(page => page.route)
}, null, 2))
