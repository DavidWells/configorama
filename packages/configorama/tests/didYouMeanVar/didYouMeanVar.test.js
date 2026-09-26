/* Unresolved variable errors suggest the nearest existing key */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')
// console.log output below prints only with TEST_VERBOSE=1
const console = require('../utils').quietConsole

async function errorFor(config, opts) {
  try { await configorama(config, { configDir: __dirname, ...opts }); return '' }
  catch (e) { return e.message }
}

test('self: typo suggests nearest top-level key', async () => {
  const msg = await errorFor({ database: { host: 'x' }, ref: '${self:databse}' })
  console.log('SELF:', msg.split('\n').find((l) => /Did you mean/.test(l)))
  assert.match(msg, /Did you mean "self:database"\?/)
})

test('opt: typo suggests nearest option', async () => {
  const msg = await errorFor({ ref: '${opt:stgae}' }, { options: { stage: 'dev' } })
  console.log('OPT:', msg.split('\n').find((l) => /Did you mean/.test(l)))
  assert.match(msg, /Did you mean "opt:stage"\?/)
})

test('env: typo suggests nearest env var', async () => {
  process.env.MY_POOL_ID = 'x'
  const msg = await errorFor({ ref: '${env:MY_POOL_IE}' })
  console.log('ENV:', msg.split('\n').find((l) => /Did you mean/.test(l)))
  assert.match(msg, /Did you mean "env:MY_POOL_ID"\?/)
  delete process.env.MY_POOL_ID
})

test('no suggestion when nothing is close', async () => {
  const msg = await errorFor({ database: { host: 'x' }, ref: '${self:zzzzzzzz}' })
  assert.not.match(msg, /Did you mean/)
})

test.run()
