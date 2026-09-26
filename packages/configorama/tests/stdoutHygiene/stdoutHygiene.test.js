/* eslint-disable no-template-curly-in-string */
/* Ensures configorama never writes diagnostics to stdout during resolution.
   stdout must carry only the caller's data (resolved config), so tools like
   `configx --export` and `configorama config.yml > out.json` stay clean. */
const path = require('path')
const { spawnSync } = require('child_process')
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

test('debug tracing (--debug, DEBUG_IF, DEBUG_EVAL) does not write to stdout', () => {
  const src = path.join(__dirname, '../../src')
  const script = `
    const configorama = require(${JSON.stringify(src)})
    configorama({
      stage: 'dev',
      obj: { a: 1 },
      a: '\${opt:nope, \${self:stage}}-x',
      b: '\${if(\${self:stage} === "dev") ? "yes" : "no"}',
      c: '\${eval(1 + 2)}',
      d: '\${self:stage | toUpperCase}',
      e: '\${opt:nope, \${self:obj}}'
    }, { options: {} }).then((config) => process.stdout.write(JSON.stringify(config)))
  `
  const result = spawnSync(process.execPath, ['-e', script, '--', '--debug'], {
    env: { ...process.env, DEBUG_IF: '1', DEBUG_EVAL: '1' },
    encoding: 'utf8'
  })
  assert.is(result.status, 0, result.stderr)
  assert.ok(result.stderr.length > 0, 'debug output should go to stderr')
  assert.equal(JSON.parse(result.stdout), {
    stage: 'dev',
    obj: { a: 1 },
    a: 'dev-x',
    b: 'yes',
    c: 3,
    d: 'DEV',
    e: { a: 1 }
  })
})

test('invalid variableSources writes diagnostics to stderr only', async () => {
  let error
  const lines = await captureStdout(async () => {
    try {
      await configorama({ a: 1 }, { variableSources: [{}] })
    } catch (err) {
      error = err
    }
  })
  assert.instance(error, Error)
  assert.match(error.message, /Variable source must have a type/)
  assert.equal(lines, [])
})

test.run()
