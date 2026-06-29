import fs from 'node:fs'
import path from 'node:path'

const generatedSearchDirs = [
  'out/_pagefind',
  'public/_pagefind'
]

for (const dir of generatedSearchDirs) {
  fs.rmSync(path.resolve(dir), { recursive: true, force: true })
}
