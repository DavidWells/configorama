// Tests for wizard path display truncation - long paths must not wrap the box
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const { formatPathForDisplay } = require('../../src/utils/ui/configWizard')

test('short path under cwd renders as clickable ./relative', () => {
  const p = path.join(process.cwd(), 'config.yml')
  const out = formatPathForDisplay(p)
  assert.is(out, '.' + path.sep + 'config.yml')
})

test('long path is truncated with a leading ellipsis and keeps the filename', () => {
  const long = '/private/tmp/claude-501/-Users-david-Workspace-repos-configorama/aadcbbbb-4e28-4d31-a33f-aa93bd7fcc52/scratchpad/wizard-demo.yml'
  const out = formatPathForDisplay(long, 56)
  assert.ok(out.length <= 56, `expected <= 56, got ${out.length}`)
  assert.ok(out.startsWith('…'), 'truncated path should start with ellipsis')
  assert.ok(out.endsWith('wizard-demo.yml'), 'filename must be preserved')
})

test('empty path returns empty', () => {
  assert.is(formatPathForDisplay(''), '')
})

test.run()
