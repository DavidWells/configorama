/* eslint-disable no-template-curly-in-string */
/* Ensures configorama never writes diagnostics to stdout during resolution.
   stdout must carry only the caller's data (resolved config), so tools like
   `configx --export` and `configorama config.yml > out.json` stay clean. */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

/**
 * Run fn with process.stdout.write captured.
 * @param {Function} fn - Async function to run
 * @returns {Promise<string[]>} Captured stdout lines
 */
async function captureStdout(fn) {
  const original = process.stdout.write.bind(process.stdout)
  const chunks = []
  process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true }
  try {
    await fn()
  } catch (err) {
    // error paths must also stay off stdout
  } finally {
    process.stdout.write = original
  }
  return chunks.join('').split('\n').filter(Boolean)
}

test('missing file reference does not write to stdout', async () => {
  const lines = await captureStdout(() =>
    configorama({ a: '${file(./does-not-exist-xyz.yml)}' }, { allowUndefinedValues: true })
  )
  assert.equal(lines, [])
})

test('unresolved variable error does not write to stdout', async () => {
  const lines = await captureStdout(() => configorama({ a: '${opt:missing}' }))
  assert.equal(lines, [])
})

test('slow async resolution progress does not write to stdout', async () => {
  const slow = {
    type: 'slow',
    match: /^slow:/,
    resolver: () => new Promise((r) => setTimeout(() => r('value&x=1'), 2800)),
  }
  const lines = await captureStdout(() => configorama({ t: '${slow:x}' }, { variableSources: [slow] }))
  assert.equal(lines, [])
})

test.run()
