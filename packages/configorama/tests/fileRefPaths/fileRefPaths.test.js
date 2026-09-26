/* file() paths: refs inside a referenced file resolve from that file's folder first, and */
/* paths may contain { } $ as plain characters. Checked via both async and sync APIs.     */
/* eslint-disable no-template-curly-in-string */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

/**
 * Write files (creating folders) into a fresh temp dir
 * @param {Record<string, string>} files - Map of relative file path to contents
 * @returns {string} The temp dir
 */
function writeFiles(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-file-paths-'))
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    fs.writeFileSync(path.join(dir, name), contents)
  }
  return dir
}

/**
 * Resolve a config file with both APIs and check they agree
 * @param {string} file - Config file path
 * @returns {Promise<Record<string, any>>} Resolved config
 */
async function resolveBoth(file) {
  const config = await configorama(file, { options: {} })
  assert.equal(configorama.sync(file, { options: {} }), config, 'sync and async results differ')
  return config
}

// ==========================================
// Refs inside a referenced file
// ==========================================

test('a file ref inside a referenced file resolves from that file\'s folder', async () => {
  const dir = writeFiles({
    'root.yml': 'v: ${file(./sub/inner.yml):inner}\nwhole: ${file(./sub/inner.yml)}\n',
    'sub/inner.yml': 'inner: ${file(./deeper/leaf.json):k}\n',
    'sub/deeper/leaf.json': '{ "k": "leaf" }',
  })
  try {
    const config = await resolveBoth(path.join(dir, 'root.yml'))
    assert.is(config.v, 'leaf')
    assert.equal(config.whole, { inner: 'leaf' })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('three levels of nested files each resolve from their own folder', async () => {
  const dir = writeFiles({
    'root.yml': 'v: ${file(./a/one.yml):one}\n',
    'a/one.yml': 'one: ${file(./b/two.yml):two}\n',
    'a/b/two.yml': 'two: ${file(./c/three.json):k}\n',
    'a/b/c/three.json': '{ "k": "deep" }',
  })
  try {
    assert.is((await resolveBoth(path.join(dir, 'root.yml'))).v, 'deep')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a root-relative path inside a referenced file still resolves', async () => {
  const dir = writeFiles({
    'root.yml': 'v: ${file(./sub/inner.yml):inner}\n',
    'sub/inner.yml': 'inner: ${file(./shared/data.json):k}\n',
    'shared/data.json': '{ "k": "from-root" }',
  })
  try {
    assert.is((await resolveBoth(path.join(dir, 'root.yml'))).v, 'from-root')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('when both exist, the file next to the referencing file wins', async () => {
  const dir = writeFiles({
    'root.yml': 'v: ${file(./sub/inner.yml):inner}\nrootLevel: ${file(./data.json):k}\n',
    'sub/inner.yml': 'inner: ${file(./data.json):k}\n',
    'sub/data.json': '{ "k": "next-to-inner" }',
    'data.json': '{ "k": "next-to-root" }',
  })
  try {
    const config = await resolveBoth(path.join(dir, 'root.yml'))
    assert.is(config.v, 'next-to-inner')
    assert.is(config.rootLevel, 'next-to-root')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// ==========================================
// { } $ in file paths
// ==========================================

test('file paths containing braces and dollar signs', async () => {
  const dir = writeFiles({
    'br/{x}.json': '{ "k": "braced" }',
    'br/a$b.json': '{ "k": "dollar" }',
    'config.yml': 'a: ${file(./br/{x}.json):k}\nb: ${file(./br/a$b.json):k}\nc: ${file(./br/{x}.json)}\n',
  })
  try {
    const config = await resolveBoth(path.join(dir, 'config.yml'))
    assert.is(config.a, 'braced')
    assert.is(config.b, 'dollar')
    assert.equal(config.c, { k: 'braced' })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a variable inside a file path next to braces still resolves', async () => {
  const dir = writeFiles({
    'br/{dev}.json': '{ "k": "stage-braced" }',
    'config.yml': 'stage: dev\na: ${file(./br/{${self:stage}}.json):k}\n',
  })
  try {
    assert.is((await resolveBoth(path.join(dir, 'config.yml'))).a, 'stage-braced')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('text() paths containing braces', async () => {
  const dir = writeFiles({
    'br/{x}.txt': 'hello',
    'config.yml': 'a: ${text(./br/{x}.txt)}\n',
  })
  try {
    assert.is((await resolveBoth(path.join(dir, 'config.yml'))).a, 'hello')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test.run()
