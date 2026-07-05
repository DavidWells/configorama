/* Tests for 1Password reference normalization
   Covers alias validation, ref forms, private links, and share link rejection */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { validateAliasName, normalizeRefValue, parsePrivateLink } = require('./normalize')

const PRIVATE_LINK = 'https://start.1password.com/open/i?a=ACCT&v=vault-id-123&i=item-id-456&h=my.1password.com'
const PRIVATE_LINK_APP = 'onepassword://open/i?a=ACCT&v=vault-id-123&i=item-id-456&h=my.1password.com'

/* Alias validation */

test('accepts alphanumeric and underscore aliases', () => {
  validateAliasName('npm')
  validateAliasName('data_base_2')
  validateAliasName('UPPER')
})

test('rejects aliases with dots, hyphens, spaces, slashes', () => {
  for (const bad of ['npm.prod', 'my-alias', 'a b', 'a/b', '']) {
    try {
      validateAliasName(bad)
      assert.unreachable(`should reject "${bad}"`)
    } catch (err) {
      assert.match(err.message, /letters, numbers, and underscores/)
    }
  }
})

/* String ref forms */

test('op:// string becomes secretRef', () => {
  const ref = normalizeRefValue('op://prod/npm/notesPlain')
  assert.equal(ref, { kind: 'secretRef', ref: 'op://prod/npm/notesPlain' })
})

test('plain string becomes item', () => {
  const ref = normalizeRefValue('database-prod')
  assert.is(ref.kind, 'item')
  assert.is(ref.item, 'database-prod')
  assert.is(ref.vault, undefined)
  assert.is(ref.field, undefined)
})

test('https private link string becomes privateLink', () => {
  const ref = normalizeRefValue(PRIVATE_LINK)
  assert.is(ref.kind, 'privateLink')
  assert.is(ref.item, 'item-id-456')
  assert.is(ref.vault, 'vault-id-123')
})

test('onepassword:// private link string becomes privateLink', () => {
  const ref = normalizeRefValue(PRIVATE_LINK_APP)
  assert.is(ref.kind, 'privateLink')
  assert.is(ref.item, 'item-id-456')
  assert.is(ref.vault, 'vault-id-123')
})

test('normalized private link drops a, h, and raw URL', () => {
  const ref = normalizeRefValue(PRIVATE_LINK)
  const serialized = JSON.stringify(ref)
  assert.is(serialized.includes('ACCT'), false)
  assert.is(serialized.includes('my.1password.com'), false)
  assert.is(serialized.includes('start.1password.com'), false)
})

/* Object ref forms */

test('object with item, vault, section, field', () => {
  const ref = normalizeRefValue({ item: 'GitHub', vault: 'development', section: 'credentials', field: 'personal_token' })
  assert.equal(ref, { kind: 'item', item: 'GitHub', vault: 'development', section: 'credentials', field: 'personal_token' })
})

test('object with ref', () => {
  const ref = normalizeRefValue({ ref: 'op://prod/item/field' })
  assert.equal(ref, { kind: 'secretRef', ref: 'op://prod/item/field' })
})

test('object with url', () => {
  const ref = normalizeRefValue({ url: PRIVATE_LINK })
  assert.is(ref.kind, 'privateLink')
  assert.is(ref.item, 'item-id-456')
})

test('object combining item and ref is rejected', () => {
  try {
    normalizeRefValue({ item: 'x', ref: 'op://a/b/c' })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /exactly one of/)
  }
})

test('object with none of item, ref, url is rejected', () => {
  try {
    normalizeRefValue({ vault: 'prod' })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /exactly one of/)
  }
})

test('section without field is rejected', () => {
  try {
    normalizeRefValue({ item: 'x', section: 'creds' })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /section/)
  }
})

/* Private link parsing */

test('missing i throws invalid private link', () => {
  try {
    parsePrivateLink('https://start.1password.com/open/i?a=ACCT&v=vault-id')
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /Expected query parameter "i"/)
  }
})

test('missing v allows fetch and attaches warning', () => {
  const ref = parsePrivateLink('https://start.1password.com/open/i?a=ACCT&i=item-id-456')
  assert.is(ref.item, 'item-id-456')
  assert.is(ref.vault, undefined)
  assert.is(ref.warnings.length, 1)
  assert.is(ref.warnings[0].code, 'op_private_link_missing_vault')
})

/* Public share links */

test('public share links are rejected', () => {
  try {
    normalizeRefValue('https://share.1password.com/s#sometoken')
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /Public 1Password share links are not supported/)
    assert.is(err.message.includes('sometoken'), false)
  }
})

test('unrecognized 1Password URLs are rejected, not treated as item names', () => {
  try {
    normalizeRefValue('https://example.com/whatever')
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /Unrecognized/)
  }
})

test.run()
