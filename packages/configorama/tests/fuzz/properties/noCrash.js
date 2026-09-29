/* Property: any expression, well-formed or not, either resolves or fails with a           */
/* configorama error about the config. Never a JS crash (TypeError: x is not a function),  */
/* never a hang, never output on stdout (AGENTS.md "stdout hygiene"), and the sync and    */
/* async APIs agree. Expressions are random token soup built from real syntax pieces.     */
/* eslint-disable no-template-curly-in-string */
const { fc, resolveBoth, describe, isCrash, PropertyFailure, withTimeout } = require('../fuzzUtils')
const { syntaxString } = require('../arbitraries')

const PIECES = ['${', '}', '${self:custom.v}', '${self:custom.obj}', '${self:custom.list}', '${env:CONFIGORAMA_FUZZ_SET}',
  '${env:CONFIGORAMA_FUZZ_UNSET}', '${opt:stage}', 'self:', 'env:', 'opt:', 'custom.v', 'custom.obj.a', ', ', ',', ' ', "'", '"',
  "'lit'", '| ', 'toUpperCase', 'split(\',\')', 'join(\'-\')', 'String', 'Number', 'Boolean', 'help(\'x\')',
  '(', ')', '[', ']', 'if(', 'eval(', 'merge(', 'file(./nope.json)', 'text(./nope.txt)', 'cron(\'daily\')',
  '==', '&&', '? ', ': ', '1', 'true', 'null', 'custom', '.', ':', '$', '{', '\\', '#', '@', '__CFG_C44__', '__JSON_B64__eA==__']

/** @type {import('fast-check').Arbitrary<{ expr: string, lenient: boolean }>} */
const arbitrary = fc.record({
  expr: fc.array(fc.oneof(
    { weight: 5, arbitrary: fc.constantFrom(...PIECES) },
    { weight: 1, arbitrary: syntaxString },
  ), { minLength: 1, maxLength: 10 }).map((parts) => parts.join('')),
  lenient: fc.boolean(),
})

/**
 * @param {{ expr: string, lenient: boolean }} c
 */
async function check(c) {
  process.env.CONFIGORAMA_FUZZ_SET = 'set,value'
  delete process.env.CONFIGORAMA_FUZZ_UNSET
  const yml = `custom:\n  v: 'a|b, c'\n  list: [a, b]\n  obj: { a: 1 }\nout: ${JSON.stringify(c.expr)}\n`
  const settings = c.lenient ? { allowUnresolvedVariables: true, allowUnknownVariableTypes: true } : {}
  const detail = { expr: c.expr, lenient: c.lenient }
  const res = await withTimeout(resolveBoth(yml, Object.assign({ options: { stage: 'dev' } }, settings)), 10000, detail)
  if (res.stdout) throw new PropertyFailure('writes to stdout', Object.assign(detail, { stdout: res.stdout.slice(0, 200) }))
  for (const api of /** @type {const} */ (['async', 'sync'])) {
    const outcome = res[api]
    if (!outcome.ok && isCrash(outcome.error)) {
      throw new PropertyFailure(`crashes (${api})`, Object.assign(detail, { error: describe(outcome), at: String(outcome.error.stack).split('\n')[1] }))
    }
  }
  const a = res.async.ok ? JSON.stringify(res.async.value.out) : 'throws'
  const s = res.sync.ok ? JSON.stringify(res.sync.value.out) : 'throws'
  if (a !== s) throw new PropertyFailure('sync API differs from async', Object.assign(detail, { async: describe(res.async), sync: describe(res.sync) }))
}

module.exports = { name: 'no crashes', runs: 150, arbitrary, check }
