/* Properties over generated expressions (refs, literals, fallbacks, filters, functions,   */
/* if). The oracle is the plain rendering of the same expression:                          */
/*  - whitespace and quote style don't change the result: ${env:A,self:b} is ${ env:A ,    */
/*    self:b }, and 'it\'s' is "it's"                                                     */
/*  - a missing first fallback changes nothing: ${env:UNSET, X} is X, for any X            */
/* eslint-disable no-template-curly-in-string */
const { fc, resolveBoth, describe, PropertyFailure } = require('../fuzzUtils')
const { CONFIG_YAML, node, style, render, PLAIN } = require('../expressions')

/**
 * @param {string} expr
 * @param {boolean} [sync] - Also run the sync API
 */
async function resolveOut(expr, sync = false) {
  delete process.env.CONFIGORAMA_FUZZ_EXPR_UNSET
  const res = await resolveBoth(`${CONFIG_YAML}out: ${JSON.stringify(expr)}\n`, {}, { sync })
  const pick = (/** @type {any} */ o) => o.ok ? { ok: true, value: o.value.out } : o
  return { async: pick(res.async), sync: pick(res.sync) }
}

const arbitrary = fc.record({ node, style })

/**
 * @param {{ node: import('../expressions').Node, style: import('../expressions').Style }} c
 */
async function check(c) {
  const plain = render(c.node, PLAIN)
  const base = await resolveOut(plain, true)
  if (describe(base.sync) !== describe(base.async)) {
    throw new PropertyFailure('sync API differs from async', { expr: plain, async: describe(base.async), sync: describe(base.sync) })
  }
  if (!base.async.ok) return
  const want = describe(base.async)

  const styled = render(c.node, c.style)
  const got = describe((await resolveOut(styled)).async)
  if (got !== want) throw new PropertyFailure('whitespace or quote style changes the result', { plain, styled, want, got })

  const value = base.async.value
  if (value && typeof value === 'object' && !Object.keys(value).length) return // empty counts as no value in a list
  const wrapped = `\${env:CONFIGORAMA_FUZZ_EXPR_UNSET, ${plain}}`
  const gotWrapped = describe((await resolveOut(wrapped)).async)
  if (gotWrapped !== want) throw new PropertyFailure('a missing first fallback changes the result', { plain, wrapped, want, got: gotWrapped })
}

module.exports = { name: 'equivalence', runs: 100, arbitrary, check }
