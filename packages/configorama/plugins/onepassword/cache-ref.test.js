/* Tests for synthetic cache ref construction.
   Keys must be stable, collision-free per dimension, and never contain raw links. */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { buildCacheRef, CACHE_REF_SCHEMA_VERSION } = require('./cache-ref')

const itemRef = { kind: 'item', item: 'database-prod', vault: 'infra', section: undefined, field: 'password' }

test('same inputs produce the same ref', () => {
  const a = buildCacheRef(itemRef, 'database.password')
  const b = buildCacheRef({ ...itemRef }, 'database.password')
  assert.is(a, b)
})

test('ref shape is configorama-op://<version>/<sha256hex>', () => {
  const ref = buildCacheRef(itemRef, undefined)
  assert.match(ref, new RegExp(`^configorama-op://${CACHE_REF_SCHEMA_VERSION}/[0-9a-f]{64}$`))
})

test('every dimension change produces a different ref', () => {
  const base = buildCacheRef(itemRef, 'k')
  const variants = [
    buildCacheRef({ ...itemRef, kind: 'privateLink' }, 'k'),
    buildCacheRef({ ...itemRef, item: 'other-item' }, 'k'),
    buildCacheRef({ ...itemRef, vault: 'other-vault' }, 'k'),
    buildCacheRef({ ...itemRef, section: 'a-section' }, 'k'),
    buildCacheRef({ ...itemRef, field: 'username' }, 'k'),
    buildCacheRef(itemRef, 'other.key'),
    buildCacheRef(itemRef, undefined),
  ]
  const all = new Set([base, ...variants])
  assert.is(all.size, variants.length + 1)
})

test('secretRef uses the op:// ref as the item dimension', () => {
  const a = buildCacheRef({ kind: 'secretRef', ref: 'op://vault/item/notesPlain' }, 'KEY')
  const b = buildCacheRef({ kind: 'secretRef', ref: 'op://vault/item/other' }, 'KEY')
  assert.is.not(a, b)
})

test('adjacent dimensions cannot collide via separator ambiguity', () => {
  // item "a" + vault "b" must differ from item "ab" + vault ""
  const a = buildCacheRef({ kind: 'item', item: 'a', vault: 'b' }, undefined)
  const b = buildCacheRef({ kind: 'item', item: 'ab', vault: undefined }, undefined)
  assert.is.not(a, b)
})

test('private link refs contain no URL fragments', () => {
  // normalize.js reduces private links to item/vault IDs before this point
  const ref = buildCacheRef({ kind: 'privateLink', item: 'abc123def456ghij789klm2345', vault: 'vaultid123' }, 'NPM_TOKEN')
  assert.not.match(ref, /https?:|start\.1password|%2F/i)
  assert.match(ref, /^configorama-op:\/\/v1\/[0-9a-f]{64}$/)
})

test('undefined and empty-string dimensions are equivalent and stable', () => {
  const a = buildCacheRef({ kind: 'item', item: 'x', vault: undefined, section: undefined, field: undefined }, undefined)
  const b = buildCacheRef({ kind: 'item', item: 'x', vault: '', section: '', field: '' }, undefined)
  assert.is(a, b)
})

test.run()
