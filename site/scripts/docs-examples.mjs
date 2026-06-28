import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { markdownMagic } = require('markdown-magic')
const config = require('./markdown-magic.config.cjs')

const mode = process.argv.includes('--check') ? 'check' : 'write'
const result = await markdownMagic({
  ...config,
  dry: true,
  silent: true
})

if (result.errors?.length) {
  console.error('Docs example generation failed.')
  console.error(JSON.stringify(result.errors, null, 2))
  process.exit(1)
}

const changed = result.results.filter(item => item.isChanged)

if (mode === 'check') {
  if (changed.length) {
    console.error('Docs examples are stale. Run npm run docs:examples from site/.')
    for (const item of changed) {
      console.error(`- ${item.srcPath}`)
    }
    process.exit(1)
  }

  console.log('Docs examples are up to date.')
  process.exit(0)
}

for (const item of changed) {
  fs.writeFileSync(item.outputPath, item.updatedContents)
  console.log(`Updated ${item.srcPath}`)
}

if (!changed.length) {
  console.log('Docs examples are already up to date.')
}
