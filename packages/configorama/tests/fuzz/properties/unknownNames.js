/* Property: an unknown function, filter or source is an error that names it. It never    */
/* comes back as literal text: ${concat('a', 'b')} used to return "concat('a', 'b')".      */
/* eslint-disable no-template-curly-in-string */
const { fc, resolveBoth, describe, PropertyFailure } = require('../fuzzUtils')

const KNOWN = new Set(['split', 'join', 'length', 'merge', 'upperkeys', 'md5', 'file', 'text', 'eval', 'if', 'cron', 'git',
  'self', 'env', 'opt', 'option', 'options', 'param', 'deep', 'string', 'number', 'help', 'oneof'])

const name = fc.tuple(fc.constantFrom('a', 'c', 'x', 'my', 'get', 'to', 'con'), fc.stringMatching(/^[A-Za-z0-9_]{0,6}$/))
  .map(([a, b]) => a + b)
  .filter((n) => !KNOWN.has(n.toLowerCase()))

/** @type {import('fast-check').Arbitrary<{ name: string, kind: string, arg: string }>} */
const arbitrary = fc.record({
  name,
  kind: fc.constantFrom('function', 'filter', 'source'),
  arg: fc.constantFrom("'a'", "'a', 'b'", '1', '${self:custom.v}', ''),
})

/**
 * @param {{ name: string, kind: string, arg: string }} c
 */
async function check(c) {
  const expr = c.kind === 'function' ? `\${${c.name}(${c.arg})}`
    : c.kind === 'filter' ? `\${self:custom.v | ${c.name}}`
      : `\${${c.name}:thing}`
  const res = await resolveBoth(`custom:\n  v: val\nout: ${JSON.stringify(expr)}\n`, {}, { sync: false })
  const detail = { expr, got: describe(res.async) }
  if (res.async.ok) throw new PropertyFailure(`unknown ${c.kind} resolves instead of failing`, detail)
  if (!String(res.async.error.message).includes(c.name)) throw new PropertyFailure(`error doesn't name the unknown ${c.kind}`, detail)
}

module.exports = { name: 'unknown names', runs: 100, arbitrary, check }
