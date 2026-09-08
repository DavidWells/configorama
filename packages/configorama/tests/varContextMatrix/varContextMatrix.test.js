/* Exhaustive matrix: a variable embedded in every YAML container/quoting/embedding */
/* resolves to the exact expected string with no injected quotes or corruption.     */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const configorama = require('../../src')

const R = 'us-east-1_zMCQjZIHO' // clean resolved value, zero quote bytes

// Variable forms that all resolve to R, covering every user-facing resolver.
const vars = [
  { tag: 'env', ref: '${env:MATRIX_POOL}' },
  { tag: 'self', ref: '${self:base}' },
  { tag: 'opt', ref: '${opt:pool}' },
]

// How the variable is embedded in an element: element text builder + expected leaf.
const embeds = [
  { tag: 'bare', el: (v) => v, exp: R },
  { tag: 'prefix', el: (v) => `pre/${v}`, exp: `pre/${R}` },
  { tag: 'suffix', el: (v) => `${v}/post`, exp: `${R}/post` },
  { tag: 'both', el: (v) => `pre/${v}/post`, exp: `pre/${R}/post` },
  { tag: 'arn', el: (v) => `arn:aws:cognito-idp:*:*:userpool/${v}`, exp: `arn:aws:cognito-idp:*:*:userpool/${R}` },
  { tag: 'star', el: (v) => `${v}*`, exp: `${R}*` },
]

// Containers that MUST resolve cleanly. `value` builds the YAML after "key:" given a
// quoted element string; `get` extracts the resolved leaf from the key's parsed value.
const containers = [
  { tag: 'dq-scalar', quote: '"', value: (q) => ` ${q}`, get: (val) => val },
  { tag: 'sq-scalar', quote: "'", value: (q) => ` ${q}`, get: (val) => val },
  { tag: 'flow-arr-dq', quote: '"', value: (q) => ` [${q}]`, get: (val) => val[0] },
  { tag: 'flow-arr-sq', quote: "'", value: (q) => ` [${q}]`, get: (val) => val[0] },
  { tag: 'block-arr-dq', quote: '"', value: (q) => `\n  - ${q}`, get: (val) => val[0] },
  { tag: 'block-arr-sq', quote: "'", value: (q) => `\n  - ${q}`, get: (val) => val[0] },
  { tag: 'flow-obj-dq', quote: '"', value: (q) => ` {a: ${q}}`, get: (val) => val.a },
  { tag: 'flow-obj-sq', quote: "'", value: (q) => ` {a: ${q}}`, get: (val) => val.a },
  { tag: 'block-obj-dq', quote: '"', value: (q) => `\n  a: ${q}`, get: (val) => val.a },
  { tag: 'nested-flow-sq', quote: "'", value: (q) => ` [[${q}]]`, get: (val) => val[0][0] },
  { tag: 'flow-arr-in-obj-sq', quote: "'", value: (q) => ` {a: [${q}]}`, get: (val) => val.a[0] },
  // literal brackets inside a quoted scalar are a string, not an array
  { tag: 'literal-brackets-dq', quote: '"', get: (val) => val, wrapWhole: true },
]

function buildCases() {
  const cases = []
  let n = 0
  for (const v of vars) {
    for (const e of embeds) {
      for (const c of containers) {
        const key = `k${n++}`
        let line
        let exp = e.exp
        if (c.wrapWhole) {
          // key: "[<element>]"  -> resolves to the string "[<element-resolved>]"
          line = `${key}: "[${e.el(v.ref)}]"`
          exp = `[${e.exp}]`
        } else {
          const quoted = `${c.quote}${e.el(v.ref)}${c.quote}`
          line = `${key}:${c.value(quoted)}`
        }
        cases.push({ key, line, exp, get: c.get, label: `${c.tag} | ${v.tag} | ${e.tag}` })
      }
    }
  }
  return cases
}

let config
const cases = buildCases()

test.before(async () => {
  process.env.MATRIX_POOL = R
  const doc = ['base: ' + R, ...cases.map((c) => c.line)].join('\n') + '\n'
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-'))
  const file = path.join(dir, 'matrix.yml')
  fs.writeFileSync(file, doc)
  config = await configorama(file, { configDir: dir, options: { pool: R } })
  fs.rmSync(dir, { recursive: true, force: true })
})

test.after(() => { delete process.env.MATRIX_POOL })

test(`var-in-context matrix (${cases.length} cases) resolves cleanly`, () => {
  const failures = []
  for (const c of cases) {
    let got
    try { got = c.get(config[c.key]) } catch (e) { got = `<throw: ${e.message}>` }
    if (got !== c.exp) failures.push(`  ${c.label}\n    line: ${c.line.replace(/\n/g, '\\n')}\n    expected ${JSON.stringify(c.exp)} got ${JSON.stringify(got)}`)
  }
  if (failures.length) console.error('MATRIX FAILURES:\n' + failures.join('\n'))
  assert.is(failures.length, 0, `${failures.length}/${cases.length} matrix failures`)
})

test.run()
