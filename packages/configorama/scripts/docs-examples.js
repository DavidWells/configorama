// Generate docs example blocks from tested source fixtures so the docs site can
// never drift from real behavior. For each registry entry it resolves the fixture,
// writes a golden output (asserted by the test), and injects the showcase input plus
// its resolved output into the matching {/* CONFIGORAMA_EXAMPLE id=... */} block.

const fs = require('fs')
const path = require('path')
const { registry } = require('../tests/docs-examples/registry')
const { loadSource, resolveExample, SOURCES_DIR } = require('../tests/docs-examples/lib')

const CONTENT_DIR = path.join(__dirname, '..', '..', '..', 'site', 'content')

/**
 * Top-level YAML keys of a fixture's showcase portion (column-0 `key:` lines).
 * @param {string} showcase
 * @returns {string[]}
 */
function showcaseKeys(showcase) {
  const keys = []
  for (const line of showcase.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_.-]+):/)
    if (m) keys.push(m[1])
  }
  return keys
}

/**
 * Replace the body between an example's open marker and its closing docs marker.
 * @param {string} mdx
 * @param {string} id
 * @param {string} body - replacement (without the marker lines)
 * @returns {string}
 */
function injectBlock(mdx, id, body) {
  const open = new RegExp(`(\\{/\\* docs CONFIGORAMA_EXAMPLE id="${id}"[^*]*\\*/\\}\\n)([\\s\\S]*?)(\\n\\{/\\* /docs \\*/\\})`)
  if (!open.test(mdx)) throw new Error(`marker for id "${id}" not found`)
  return mdx.replace(open, `$1${body}$3`)
}

async function main() {
  const write = !process.argv.includes('--check')
  let drift = 0
  for (const entry of registry) {
    const { showcase } = loadSource(entry.id)
    const full = await resolveExample(entry)
    // golden: full resolution (covers edge cases too). Dynamic examples (e.g. git)
    // resolve non-deterministically, so they use a fixed displayOutput instead.
    if (!entry.dynamic) {
      const goldenPath = path.join(SOURCES_DIR, `${entry.id}.output.json`)
      if (write) fs.writeFileSync(goldenPath, JSON.stringify(full, null, 2) + '\n')
    }

    // docs output: only the showcase's top-level keys, so edge cases stay hidden
    const keys = showcaseKeys(showcase)
    /** @type {Record<string, unknown>} */
    const shown = {}
    const source = entry.dynamic ? (entry.displayOutput || {}) : full
    for (const k of keys) shown[k] = source[k]

    const body = [
      '```yaml',
      showcase.replace(/\n$/, ''),
      '```',
      '',
      'Resolves to:',
      '',
      '```json',
      JSON.stringify(shown, null, 2),
      '```',
    ].join('\n')

    const mdxPath = path.join(CONTENT_DIR, entry.page)
    const mdx = fs.readFileSync(mdxPath, 'utf8')
    const next = injectBlock(mdx, entry.id, body)
    if (next !== mdx) {
      drift++
      if (write) fs.writeFileSync(mdxPath, next)
      console.error(`${write ? 'updated' : 'DRIFT'}: ${entry.page} (${entry.id})`)
    }
  }
  if (!write && drift) {
    console.error(`\n${drift} docs example(s) out of date. Run: npm run docs:examples`)
    process.exit(1)
  }
  console.error(write ? 'docs examples generated' : 'docs examples up to date')
}

main().catch((err) => { console.error(err); process.exit(1) })
