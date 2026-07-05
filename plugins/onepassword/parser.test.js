/* Tests for 1Password structured value parser
   Verifies INI/dotenv key path reads and raw value rules */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { parseStructuredSecret, getKeyPath } = require('./parser')

const INI_FIXTURE = `# npm automation token
NPM_TOKEN=npm_xxx

[database]
password=s3cr3t
`

test('parses KEY=value', () => {
  const parsed = parseStructuredSecret('NPM_TOKEN=npm_xxx')
  assert.is(parsed.NPM_TOKEN, 'npm_xxx')
})

test('ignores # comments', () => {
  const parsed = parseStructuredSecret(INI_FIXTURE)
  assert.is(parsed.NPM_TOKEN, 'npm_xxx')
  assert.is(Object.keys(parsed).includes('# npm automation token'), false)
})

test('ignores ; comments', () => {
  const parsed = parseStructuredSecret('; a comment\nKEY=value')
  assert.is(parsed.KEY, 'value')
})

test('supports section paths', () => {
  const parsed = parseStructuredSecret(INI_FIXTURE)
  assert.is(getKeyPath(parsed, 'database.password', 'notesPlain'), 's3cr3t')
})

test('returns top-level keys via getKeyPath', () => {
  const parsed = parseStructuredSecret(INI_FIXTURE)
  assert.is(getKeyPath(parsed, 'NPM_TOKEN', 'notesPlain'), 'npm_xxx')
})

test('errors on missing key with field name and no secret content', () => {
  const parsed = parseStructuredSecret(INI_FIXTURE)
  try {
    getKeyPath(parsed, 'MISSING_KEY', 'notesPlain')
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /Key path "MISSING_KEY" was not found in 1Password field "notesPlain"/)
    assert.is(err.message.includes('npm_xxx'), false)
    assert.is(err.message.includes('s3cr3t'), false)
  }
})

test('preserves empty string values', () => {
  const parsed = parseStructuredSecret('EMPTY=\nOTHER=x')
  assert.is(getKeyPath(parsed, 'EMPTY', 'notesPlain'), '')
})

test('values containing = are not truncated', () => {
  const parsed = parseStructuredSecret('TOKEN=abc==def=')
  assert.is(parsed.TOKEN, 'abc==def=')
})

test('boolean-like values stay strings', () => {
  const parsed = parseStructuredSecret('FLAG=true\nOFF=false')
  assert.is(getKeyPath(parsed, 'FLAG', 'notesPlain'), 'true')
  assert.is(getKeyPath(parsed, 'OFF', 'notesPlain'), 'false')
})

test('quoted values keep dotenv semantics (quotes stripped)', () => {
  const parsed = parseStructuredSecret('KEY="quoted value"')
  assert.is(parsed.KEY, 'quoted value')
})

test.run()
