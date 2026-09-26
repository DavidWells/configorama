/* Tests for rewriting relative file()/text() refs inside a referenced file so they point */
/* at files next to that file, relative to the root config folder                        */
/* eslint-disable no-template-curly-in-string */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const { rebaseFileRefs } = require('./rebaseFileRefs')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-rebase-'))
const sub = path.join(root, 'sub')
fs.mkdirSync(path.join(sub, 'deeper'), { recursive: true })
fs.writeFileSync(path.join(sub, 'deeper', 'leaf.json'), '{}')
fs.writeFileSync(path.join(sub, 'local.txt'), 'x')
fs.writeFileSync(path.join(root, 'shared.json'), '{}')

test.after(() => fs.rmSync(root, { recursive: true, force: true }))

test('refs to files next to the referencing file are rebased onto the root folder', () => {
  assert.is(rebaseFileRefs('a: ${file(./deeper/leaf.json):k}', sub, root), 'a: ${file(./sub/deeper/leaf.json):k}')
  assert.is(rebaseFileRefs('a: ${text(./local.txt)}', sub, root), 'a: ${text(./sub/local.txt)}')
  assert.is(rebaseFileRefs("a: ${file('./deeper/leaf.json')}", sub, root), "a: ${file('./sub/deeper/leaf.json')}")
})

test('refs whose target is not next to the referencing file are left as written', () => {
  const text = 'a: ${file(./shared.json)} b: ${file(./missing.json)}'
  assert.is(rebaseFileRefs(text, sub, root), text)
})

test('absolute, aliased and variable paths are left as written', () => {
  const text = 'a: ${file(/abs/x.json)} b: ${file(~/x.json)} c: ${file(./${self:stage}.json)}'
  assert.is(rebaseFileRefs(text, sub, root), text)
})

test('nothing changes when the referencing file is in the root folder', () => {
  const text = 'a: ${file(./shared.json)}'
  assert.is(rebaseFileRefs(text, root, root), text)
})

test('parent-relative refs are rebased too', () => {
  const nested = path.join(sub, 'deeper')
  assert.is(rebaseFileRefs('a: ${text(../local.txt)}', nested, root), 'a: ${text(./sub/local.txt)}')
})

test.run()
