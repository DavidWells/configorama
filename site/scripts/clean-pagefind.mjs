import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = fileURLToPath(new URL('..', import.meta.url))

const generatedSearchDirs = [
  'out/_pagefind',
  'public/_pagefind'
]

for (const dir of generatedSearchDirs) {
  fs.rmSync(path.join(siteRoot, dir), { recursive: true, force: true })
}
