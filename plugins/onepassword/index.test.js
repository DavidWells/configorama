/* Tests for the 1Password variable source resolver
   Mocked execFile throughout; never calls the real op CLI */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')
const createOnePasswordResolver = require('./index')

const INI_NOTE = `# npm automation token
NPM_TOKEN=npm_xxx

[database]
password=s3cr3t
`

const items = {
  'note-item': {
    id: 'note-item',
    title: 'npm automation',
    fields: [{ id: 'notesPlain', type: 'STRING', purpose: 'NOTES', label: 'notesPlain', value: INI_NOTE }],
  },
  'database-prod': {
    id: 'database-prod',
    title: 'database-prod',
    fields: [
      { id: 'username', type: 'STRING', purpose: 'USERNAME', label: 'username', value: 'admin' },
      { id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: 'db-secret' },
    ],
  },
  'item-id-456': {
    id: 'item-id-456',
    title: 'Linked Item',
    fields: [{ id: 'notesPlain', type: 'STRING', purpose: 'NOTES', label: 'notesPlain', value: INI_NOTE }],
  },
  'My Database Login': {
    id: 'login-1',
    title: 'My Database Login',
    fields: [{ id: 'password', type: 'CONCEALED', purpose: 'PASSWORD', label: 'password', value: 'login-secret' }],
  },
}

/**
 * Fake execFile returning fixtures for op read / op item get
 * @param {object} [overrides] - { failFirst } to fail the first call
 * @returns {{execFile: Function, calls: Array}} Fake and call log
 */
function fakeOp(overrides = {}) {
  const calls = []
  let failed = false
  function execFile(cmd, args, opts, cb) {
    calls.push({ cmd, args })
    if (overrides.failFirst && !failed) {
      failed = true
      const err = Object.assign(new Error('fail'), { code: 1 })
      return cb(err, '', 'item not found')
    }
    if (args[0] === 'read') {
      return cb(null, INI_NOTE, '')
    }
    const spec = args[2]
    const item = items[spec]
    if (!item) {
      const err = Object.assign(new Error('fail'), { code: 1 })
      return cb(err, '', `"${spec}" isn't an item`)
    }
    cb(null, JSON.stringify(item), '')
  }
  return { execFile, calls }
}

/**
 * Fake valueObject matching what the core resolver loop passes
 * @param {string} varString - Variable body
 * @returns {object} valueObject stub
 */
function vo(varString) {
  return { originalSource: `\${${varString}}`, path: ['provider', 'key'] }
}

/* Resolution through configorama */

test('alias secret ref resolves through op read', async () => {
  const fake = fakeOp()
  const source = createOnePasswordResolver({ refs: { npm: 'op://prod/npm/notesPlain' }, execFile: fake.execFile })
  const config = await configorama({ token: '${op:npm.NPM_TOKEN}' }, { variableSources: [source] })
  assert.is(config.token, 'npm_xxx')
  assert.equal(fake.calls[0].args.slice(0, 3), ['read', '--no-newline', 'op://prod/npm/notesPlain'])
})

test('alias item name resolves through op item get with inference', async () => {
  const fake = fakeOp()
  const source = createOnePasswordResolver({ refs: { db: 'database-prod' }, execFile: fake.execFile })
  const config = await configorama({ password: '${op:db}' }, { variableSources: [source] })
  assert.is(config.password, 'db-secret')
  assert.is(fake.calls[0].args[0], 'item')
})

test('alias object passes vault and field', async () => {
  const fake = fakeOp()
  const source = createOnePasswordResolver({
    refs: { db: { item: 'database-prod', vault: 'production', field: 'password' } },
    execFile: fake.execFile,
  })
  const config = await configorama({ password: '${op:db}' }, { variableSources: [source] })
  assert.is(config.password, 'db-secret')
  assert.is(fake.calls[0].args.includes('--vault'), true)
  assert.is(fake.calls[0].args.includes('production'), true)
})

test('alias private link resolves via item and vault IDs', async () => {
  const fake = fakeOp()
  const source = createOnePasswordResolver({
    refs: { linked: 'https://start.1password.com/open/i?a=ACCT&v=vault-id-123&i=item-id-456&h=my.1password.com' },
    execFile: fake.execFile,
  })
  const config = await configorama({ token: '${op:linked.NPM_TOKEN}' }, { variableSources: [source] })
  assert.is(config.token, 'npm_xxx')
  assert.is(fake.calls[0].args[2], 'item-id-456')
  assert.is(fake.calls[0].args.includes('--vault'), true)
  assert.is(fake.calls[0].args.includes('vault-id-123'), true)
})

test('raw alias returns whole field text and section key paths work', async () => {
  const fake = fakeOp()
  const source = createOnePasswordResolver({ refs: { npm: 'note-item' }, execFile: fake.execFile })
  const config = await configorama(
    {
      rawNote: '${op:npm}',
      token: '${op:npm.NPM_TOKEN}',
      dbPassword: '${op:npm.database.password}',
    },
    { variableSources: [source] }
  )
  assert.is(config.rawNote, INI_NOTE)
  assert.is(config.token, 'npm_xxx')
  assert.is(config.dbPassword, 's3cr3t')
})

test('direct function syntax with op:// ref and key path', async () => {
  const fake = fakeOp()
  const source = createOnePasswordResolver({ execFile: fake.execFile })
  const config = await configorama(
    {
      whole: '${op(op://vault/item/notesPlain)}',
      key: '${op(op://vault/item/notesPlain).NPM_TOKEN}',
    },
    { variableSources: [source] }
  )
  assert.is(config.whole, INI_NOTE)
  assert.is(config.key, 'npm_xxx')
})

test('direct function syntax with item id and item name with spaces', async () => {
  const fake = fakeOp()
  const source = createOnePasswordResolver({ execFile: fake.execFile })
  const config = await configorama(
    {
      linked: '${op(item-id-456).NPM_TOKEN}',
      login: '${op(My Database Login).password}',
    },
    { variableSources: [source] }
  )
  assert.is(config.linked, 'npm_xxx')
  assert.is(config.login, 'login-secret')
})

/* Rejections (resolver called directly) */

test('raw op:// in colon syntax is rejected with pointer to function syntax', async () => {
  const source = createOnePasswordResolver({ execFile: fakeOp().execFile })
  try {
    await source.resolver('op:op://vault/item/field', {}, {}, vo('op:op://vault/item/field'))
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /Use \$\{op\(op:\/\/vault\/item\/field\)\} for direct secret references/)
  }
})

test('private link in colon syntax is rejected', async () => {
  const source = createOnePasswordResolver({ execFile: fakeOp().execFile })
  try {
    await source.resolver('op:https://start.1password.com/open/i?i=x', {}, {}, vo('op:https://...'))
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /letters, numbers, and underscores|aliases/i)
  }
})

test('public share link in function syntax is rejected', async () => {
  const source = createOnePasswordResolver({ execFile: fakeOp().execFile })
  try {
    await source.resolver('op(https://share.1password.com/s#tok)', {}, {}, vo('op(...)'))
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /Public 1Password share links are not supported/)
  }
})

test('unknown alias names the missing ref', async () => {
  const source = createOnePasswordResolver({ refs: {}, execFile: fakeOp().execFile })
  try {
    await source.resolver('op:npm', {}, {}, vo('op:npm'))
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /Unknown 1Password alias "npm". Configure refs.npm/)
  }
})

test('invalid alias key rejected at factory time', () => {
  try {
    createOnePasswordResolver({ refs: { 'npm.prod': 'x' } })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /letters, numbers, and underscores/)
  }
})

/* Metadata */

test('metadata records references but never secret values or URLs', async () => {
  const fake = fakeOp()
  const source = createOnePasswordResolver({
    refs: {
      npm: 'op://prod/npm/notesPlain',
      linked: 'https://start.1password.com/open/i?a=ACCT&v=vault-id-123&i=item-id-456&h=my.1password.com',
    },
    execFile: fake.execFile,
  })
  await configorama({ a: '${op:npm.NPM_TOKEN}', b: '${op:linked.NPM_TOKEN}' }, { variableSources: [source] })
  const metadata = source.collectMetadata()
  assert.is(metadata.length, 2)
  const serialized = JSON.stringify(metadata)
  assert.is(serialized.includes('npm_xxx'), false)
  assert.is(serialized.includes('s3cr3t'), false)
  assert.is(serialized.includes('start.1password.com'), false)
  assert.is(serialized.includes('ACCT'), false)
  const linkEntry = metadata.find((entry) => entry.referenceKind === 'privateLink')
  assert.is(linkEntry.item, 'item-id-456')
  assert.is(linkEntry.vault, 'vault-id-123')
  assert.is(linkEntry.sensitive, true)
  assert.is(linkEntry.risk, 'remote_secret_read')
})

/* skipResolution */

test('skipResolution returns placeholders and records skipped metadata', async () => {
  const fake = fakeOp()
  const source = createOnePasswordResolver({
    refs: { npm: 'op://prod/npm/notesPlain' },
    skipResolution: true,
    execFile: fake.execFile,
  })
  const config = await configorama(
    {
      aliased: '${op:npm.NPM_TOKEN}',
      direct: '${op(op://vault/item/field)}',
      item: '${op(item-id-456).NPM_TOKEN}',
    },
    { variableSources: [source] }
  )
  assert.is(config.aliased, '[OP:alias:npm.NPM_TOKEN]')
  assert.is(config.direct, '[OP:secretRef:op://vault/item/field]')
  assert.is(config.item, '[OP:item:item-id-456:NPM_TOKEN]')
  assert.is(fake.calls.length, 0)
  assert.is(source.collectMetadata().every((entry) => entry.skipped === true), true)
})

/* Caching */

test('cache prevents duplicate CLI calls for the same item and ref', async () => {
  const fake = fakeOp()
  const source = createOnePasswordResolver({ refs: { npm: 'note-item' }, execFile: fake.execFile })
  await configorama(
    { a: '${op:npm.NPM_TOKEN}', b: '${op:npm.database.password}', c: '${op:npm}' },
    { variableSources: [source] }
  )
  assert.is(fake.calls.length, 1)
})

test('failed calls are not cached and retry succeeds', async () => {
  const fake = fakeOp({ failFirst: true })
  const source = createOnePasswordResolver({ refs: { npm: 'note-item' }, execFile: fake.execFile })
  try {
    await source.resolver('op:npm.NPM_TOKEN', {}, {}, vo('op:npm.NPM_TOKEN'))
    assert.unreachable('first call should fail')
  } catch (err) {
    assert.match(err.message, /could not be found/)
  }
  const value = await source.resolver('op:npm.NPM_TOKEN', {}, {}, vo('op:npm.NPM_TOKEN'))
  assert.is(value, 'npm_xxx')
  assert.is(fake.calls.length, 2)
})

test('clearCache clears caches and metadata', async () => {
  const fake = fakeOp()
  const source = createOnePasswordResolver({ refs: { npm: 'note-item' }, execFile: fake.execFile })
  await source.resolver('op:npm.NPM_TOKEN', {}, {}, vo('op:npm.NPM_TOKEN'))
  assert.is(source.collectMetadata().length, 1)
  source.clearCache()
  assert.is(source.collectMetadata().length, 0)
  await source.resolver('op:npm.NPM_TOKEN', {}, {}, vo('op:npm.NPM_TOKEN'))
  assert.is(fake.calls.length, 2)
})

/* Source contract */

test('returned source carries sensitive metadata and sync contract', () => {
  const source = createOnePasswordResolver({ refs: { npm: 'note-item' }, account: 'my' })
  assert.is(source.type, 'op')
  assert.is(source.source, 'remote')
  assert.is(source.sensitive, true)
  assert.is(source.risk, 'remote_secret_read')
  assert.is(source.match instanceof RegExp, true)
  assert.is(source.match.test('op:alias'), true)
  assert.is(source.match.test('op(item)'), true)
  assert.is(source.match.test('opt:stage'), false)
  assert.is(typeof source.syncFactory, 'string')
  assert.equal(source.syncOptions, { refs: { npm: 'note-item' }, account: 'my', configDir: undefined, skipResolution: false })
})

test.run()
