/* Every docs example fixture resolves to its committed golden output, and the docs */
/* site block stays in sync with the fixture — so published examples never drift.  */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const path = require('path')
const { registry } = require('./registry')
const { loadSource, resolveExample, SOURCES_DIR } = require('./lib')

const CONTENT_DIR = path.join(__dirname, '..', '..', '..', '..', 'site', 'content')

for (const entry of registry) {
  test(`docs example "${entry.id}" resolves to its golden output`, async () => {
    const goldenPath = path.join(SOURCES_DIR, `${entry.id}.output.json`)
    assert.ok(fs.existsSync(goldenPath), `missing golden ${entry.id}.output.json — run npm run docs:examples`)
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'))
    const resolved = await resolveExample(entry)
    assert.equal(resolved, golden, `${entry.id} resolved output drifted from its golden — run npm run docs:examples`)
  })

  test(`docs example "${entry.id}" input is in sync with the docs site`, () => {
    const mdxPath = path.join(CONTENT_DIR, entry.page)
    if (!fs.existsSync(mdxPath)) return // site not present (e.g. published-package test)
    const mdx = fs.readFileSync(mdxPath, 'utf8')
    const { showcase } = loadSource(entry.id)
    assert.ok(
      mdx.includes(showcase.replace(/\n$/, '')),
      `${entry.page} showcase block is stale — run npm run docs:examples`
    )
  })
}

test.run()
