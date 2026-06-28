// Tests for clickable path formatting - paths under cwd render as './rel' for click-to-open
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const { toClickablePath } = require('../../src/utils/ui/createEditorLink')

test('path under cwd becomes ./relative', () => {
  const p = path.join(process.cwd(), 'configs', 'app.yml')
  assert.is(toClickablePath(p), '.' + path.sep + path.join('configs', 'app.yml'))
})

test('file at cwd root becomes ./file', () => {
  const p = path.join(process.cwd(), 'config.yml')
  assert.is(toClickablePath(p), '.' + path.sep + 'config.yml')
})

test('path outside cwd stays absolute', () => {
  const p = '/private/tmp/somewhere/wizard-demo.yml'
  const out = toClickablePath(p)
  assert.is(out, path.resolve(p))
  assert.ok(path.isAbsolute(out), 'outside cwd should remain absolute')
})

test('empty path returns empty', () => {
  assert.is(toClickablePath(''), '')
})

test.run()
