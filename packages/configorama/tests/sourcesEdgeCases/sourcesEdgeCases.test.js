/* Variable sources and config shapes: nested option paths, bracket indexes, circular refs */
/* through files and parents, and empty files, via both async and sync APIs.             */
/* eslint-disable no-template-curly-in-string */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')
const { resolveYamlText } = require('../utils')

/**
 * Write files into a fresh temp dir
 * @param {Record<string, string>} files - Map of file name to contents
 * @returns {string} The temp dir
 */
function writeFiles(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-sources-'))
  for (const [name, contents] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), contents)
  return fs.realpathSync(dir)
}

/**
 * Assert a promise rejects within ms with a message matching pattern
 * @param {Promise<any>} promise - Promise expected to reject
 * @param {RegExp} pattern - Expected message pattern
 * @param {number} ms - Time limit
 */
async function assertRejectsWithin(promise, pattern, ms) {
  let timer
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), ms) })
  const outcome = await Promise.race([
    promise.then(() => 'resolved', (err) => err),
    timeout,
  ])
  clearTimeout(timer)
  assert.is.not(outcome, 'timeout', `did not settle within ${ms}ms`)
  assert.is.not(outcome, 'resolved', 'should reject')
  assert.match(outcome.message, pattern)
}

// ==========================================
// Nested option paths
// ==========================================

test('opt: dot path reads nested options (as --aws.region parses)', async () => {
  const config = await resolveYamlText(`region: \${opt:aws.region, 'us-east-1'}
first: \${opt:arr.0}
`, { options: { aws: { region: 'eu-west-1' }, arr: ['x', 'y'] } })
  assert.is(config.region, 'eu-west-1')
  assert.is(config.first, 'x')
})

test('opt: a flat dotted key still wins, and a missing nested path falls back', async () => {
  const flat = await resolveYamlText(`region: \${opt:aws.region, 'us-east-1'}\n`, { options: { 'aws.region': 'flat' } })
  assert.is(flat.region, 'flat')
  const missing = await resolveYamlText(`region: \${opt:aws.region, 'us-east-1'}\n`, { options: { aws: {} } })
  assert.is(missing.region, 'us-east-1')
})

// ==========================================
// Bracket indexes
// ==========================================

test('bracket indexes in self refs', async () => {
  const config = await resolveYamlText(`items: [first, second]
objs:
  - n: zero
  - n: one
a: \${items[1]}
b: \${self:items[1]}
c: \${objs[1].n}
d: x-\${items[0]}-y
e: \${self:objs[0]['n']}
`)
  assert.is(config.a, 'second')
  assert.is(config.b, 'second')
  assert.is(config.c, 'one')
  assert.is(config.d, 'x-first-y')
  assert.is(config.e, 'zero')
})

test('bracket indexes in file refs', async () => {
  const dir = writeFiles({
    'data.json': JSON.stringify({ variable: { region: [{ default: 'us-east-1' }] } }),
    'config.yml': 'v: ${file(./data.json):variable.region[0].default}\n',
  })
  try {
    const file = path.join(dir, 'config.yml')
    assert.is((await configorama(file, { options: {} })).v, 'us-east-1')
    assert.is(configorama.sync(file, { options: {} }).v, 'us-east-1')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// ==========================================
// Circular references
// ==========================================

test('a key referencing its own parent fails as circular', async () => {
  await assertRejectsWithin(resolveYamlText('o:\n  k: ${self:o}\n'), /Circular/i, 10000)
})

test('circular file refs fail as circular instead of hanging', async () => {
  const dir = writeFiles({
    'a.yml': 'a: ${file(./b.yml):v}\n',
    'b.yml': 'v: ${file(./a.yml):a}\n',
  })
  try {
    // A hang here is synchronous and would block this process, so resolve in a child with a hard limit
    const script = `require(${JSON.stringify(path.join(__dirname, '../../src'))})(${JSON.stringify(path.join(dir, 'a.yml'))}, { options: {} })
      .then(() => { console.error('RESOLVED'); process.exit(0) }, (err) => { console.error(err.message); process.exit(1) })`
    const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 15000 })
    assert.is(result.signal, null, 'resolution hung and was killed')
    assert.is(result.status, 1)
    assert.match(result.stderr, /Circular/i, result.stderr)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the same file ref twice in one value is not circular', async () => {
  const dir = writeFiles({
    'x.yml': 'a: one\nb: two\n',
    'config.yml': 'v: ${file(./x.yml):a}-${file(./x.yml):a}\nw: ${file(./x.yml):a}\nnested:\n  k: ${file(./x.yml):b}\n',
  })
  try {
    const file = path.join(dir, 'config.yml')
    const expected = { v: 'one-one', w: 'one', nested: { k: 'two' } }
    assert.equal(await configorama(file, { options: {} }), expected)
    assert.equal(configorama.sync(file, { options: {} }), expected)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a file whose values reference another file (no cycle) resolves', async () => {
  const dir = writeFiles({
    'leaf.yml': 'v: leaf\n',
    'mid.yml': 'm: ${file(./leaf.yml):v}\n',
    'config.yml': 'a: ${file(./mid.yml)}\nb: ${file(./mid.yml):m}\n',
  })
  try {
    const config = await configorama(path.join(dir, 'config.yml'), { options: {} })
    assert.equal(config, { a: { m: 'leaf' }, b: 'leaf' })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a file ref re-evaluated across passes (Fn::Sub body) is not circular', async () => {
  const dir = writeFiles({
    'data.json': '{ "k": "${Foo}" }\n',
    'serverless.yml': 'resources:\n  Resources:\n    D:\n      Properties:\n        Body:\n          Fn::Sub:\n            - "data=${file(./data.json)} v=${Foo}"\n            - Foo: bar\n',
  })
  try {
    const file = path.join(dir, 'serverless.yml')
    const expected = ['data={ "k": "${Foo}" }\n v=${Foo}', { Foo: 'bar' }]
    assert.equal((await configorama(file)).resources.Resources.D.Properties.Body['Fn::Sub'], expected)
    assert.equal(configorama.sync(file).resources.Resources.D.Properties.Body['Fn::Sub'], expected)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a three-file cycle fails as circular', async () => {
  const dir = writeFiles({
    'a.yml': 'a: ${file(./b.yml):b}\n',
    'b.yml': 'b: ${file(c.yml):c}\n',
    'c.yml': 'c: ${file(./a.yml):a}\n',
  })
  try {
    const script = `require(${JSON.stringify(path.join(__dirname, '../../src'))})(${JSON.stringify(path.join(dir, 'a.yml'))}, { options: {} })
      .then(() => { console.error('RESOLVED'); process.exit(0) }, (err) => { console.error(err.message); process.exit(1) })`
    const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 15000 })
    assert.is(result.signal, null, 'resolution hung and was killed')
    assert.match(result.stderr, /Circular/i, result.stderr)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// ==========================================
// Empty files
// ==========================================

test('empty and comment-only YAML files resolve to an empty config', async () => {
  assert.equal(await resolveYamlText(''), {})
  assert.equal(await resolveYamlText('# only a comment\n'), {})
})

test.run()
