import fs from 'node:fs'
import path from 'node:path'

const requiredFiles = [
  '.next/server/app/index.html',
  '.next/server/app/guides/get-started.html',
  '.next/server/app/guides/inspect-config.html',
  '.next/server/app/cli.html',
  'public/_pagefind/pagefind.js',
  'public/_pagefind/pagefind-entry.json'
]

const missing = requiredFiles.filter(file => !fs.existsSync(path.resolve(file)))
if (missing.length) {
  console.error('Smoke check failed. Missing built routes:')
  for (const file of missing) console.error(`- ${file}`)
  process.exit(1)
}

const home = fs.readFileSync('.next/server/app/index.html', 'utf8')
if (!home.includes('Configorama')) {
  console.error('Smoke check failed. Home page does not include Configorama.')
  process.exit(1)
}

console.log('Smoke check passed for built docs routes and search index.')
