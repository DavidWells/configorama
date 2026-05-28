/* Tests for AWS credential discovery and runtime swapping */
const { test } = require('uvu')
const assert = require('uvu/assert')

const {
  discoverCredentialSets,
  getAvailableAccounts,
  hasCredentials,
  getCredentials,
  useCredentials,
  clearCache,
  saveCurrentCredentials,
} = require('./credentials')

const AWS_KEYS_TO_RESTORE = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
]

/**
 * Snapshot AWS-related env vars + any matching {PREFIX}_AWS_* so the next test
 * starts with a clean slate.
 */
function snapshotEnv() {
  const snap = {}
  for (const key of Object.keys(process.env)) {
    if (AWS_KEYS_TO_RESTORE.includes(key) || /_AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|REGION)$/.test(key)) {
      snap[key] = process.env[key]
    }
  }
  return snap
}

function restoreEnv(snap) {
  // Delete all AWS-related keys currently set
  for (const key of Object.keys(process.env)) {
    if (AWS_KEYS_TO_RESTORE.includes(key) || /_AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|REGION)$/.test(key)) {
      delete process.env[key]
    }
  }
  // Restore snapshot
  for (const [k, v] of Object.entries(snap)) {
    process.env[k] = v
  }
}

function reset() {
  clearCache()
}

// One global snapshot so we don't permanently leak anything from this test file
const initialEnv = snapshotEnv()

function setUp() {
  restoreEnv({}) // clear everything AWS-related
  reset()
}

function tearDown() {
  restoreEnv(initialEnv)
  reset()
}

test('discoverCredentialSets: finds prefixed env vars', () => {
  setUp()
  try {
    process.env.PROD_AWS_ACCESS_KEY_ID = 'AKIA-PROD'
    process.env.PROD_AWS_SECRET_ACCESS_KEY = 'secret-prod'
    process.env.PROD_AWS_REGION = 'us-west-2'
    process.env.STAGING_AWS_ACCESS_KEY_ID = 'AKIA-STAGING'
    process.env.STAGING_AWS_SECRET_ACCESS_KEY = 'secret-staging'

    const sets = discoverCredentialSets()
    assert.ok(sets.has('prod'))
    assert.ok(sets.has('staging'))
    assert.is(sets.get('prod').AWS_ACCESS_KEY_ID, 'AKIA-PROD')
    assert.is(sets.get('prod').AWS_REGION, 'us-west-2')
    assert.is(sets.get('staging').AWS_ACCESS_KEY_ID, 'AKIA-STAGING')
  } finally {
    tearDown()
  }
})

test('discoverCredentialSets: captures unprefixed as default', () => {
  setUp()
  try {
    process.env.AWS_ACCESS_KEY_ID = 'AKIA-DEFAULT'
    process.env.AWS_SECRET_ACCESS_KEY = 'secret-default'
    process.env.AWS_REGION = 'us-east-1'

    const sets = discoverCredentialSets()
    assert.ok(sets.has('default'))
    assert.is(sets.get('default').AWS_ACCESS_KEY_ID, 'AKIA-DEFAULT')
  } finally {
    tearDown()
  }
})

test('discoverCredentialSets: auto-defaults when single prefixed set exists', () => {
  setUp()
  try {
    process.env.PROD_AWS_ACCESS_KEY_ID = 'AKIA-PROD'
    process.env.PROD_AWS_SECRET_ACCESS_KEY = 'secret-prod'
    process.env.PROD_AWS_REGION = 'us-west-2'

    const sets = discoverCredentialSets()
    assert.ok(sets.has('prod'))
    assert.ok(sets.has('default'), 'should auto-default to the only prefixed set')
    assert.is(sets.get('default').AWS_ACCESS_KEY_ID, 'AKIA-PROD')

    // Should also apply to env so SDK works without explicit useCredentials()
    assert.is(process.env.AWS_ACCESS_KEY_ID, 'AKIA-PROD')
  } finally {
    tearDown()
  }
})

test('discoverCredentialSets: does NOT auto-default when multiple prefixed sets exist', () => {
  setUp()
  try {
    process.env.PROD_AWS_ACCESS_KEY_ID = 'AKIA-PROD'
    process.env.PROD_AWS_SECRET_ACCESS_KEY = 'secret-prod'
    process.env.STAGING_AWS_ACCESS_KEY_ID = 'AKIA-STAGING'
    process.env.STAGING_AWS_SECRET_ACCESS_KEY = 'secret-staging'

    const sets = discoverCredentialSets()
    assert.not.ok(sets.has('default'), 'ambiguous which prefixed set is default')
    assert.not.ok(process.env.AWS_ACCESS_KEY_ID, 'should not leak into unprefixed env')
  } finally {
    tearDown()
  }
})

test('hasCredentials and getCredentials: lookup by alias (case-insensitive)', () => {
  setUp()
  try {
    process.env.PROD_AWS_ACCESS_KEY_ID = 'AKIA-PROD'
    process.env.PROD_AWS_SECRET_ACCESS_KEY = 'secret-prod'

    assert.ok(hasCredentials('prod'))
    assert.ok(hasCredentials('PROD'))
    assert.not.ok(hasCredentials('staging'))

    const creds = getCredentials('prod')
    assert.ok(creds)
    assert.is(creds.AWS_ACCESS_KEY_ID, 'AKIA-PROD')
    assert.is(getCredentials('nope'), null)
  } finally {
    tearDown()
  }
})

test('getAvailableAccounts: lists all discovered aliases', () => {
  setUp()
  try {
    process.env.PROD_AWS_ACCESS_KEY_ID = 'a'
    process.env.PROD_AWS_SECRET_ACCESS_KEY = 'b'
    process.env.STAGING_AWS_ACCESS_KEY_ID = 'c'
    process.env.STAGING_AWS_SECRET_ACCESS_KEY = 'd'

    const accounts = getAvailableAccounts().sort()
    assert.equal(accounts, ['prod', 'staging'])
  } finally {
    tearDown()
  }
})

test('useCredentials: swaps env vars during fn and restores them after', async () => {
  setUp()
  try {
    process.env.AWS_ACCESS_KEY_ID = 'default-key'
    process.env.AWS_SECRET_ACCESS_KEY = 'default-secret'
    process.env.AWS_REGION = 'us-east-1'
    process.env.PROD_AWS_ACCESS_KEY_ID = 'prod-key'
    process.env.PROD_AWS_SECRET_ACCESS_KEY = 'prod-secret'
    process.env.PROD_AWS_REGION = 'us-west-2'

    let observed
    await useCredentials('prod', async () => {
      observed = {
        key: process.env.AWS_ACCESS_KEY_ID,
        secret: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
      }
    })

    assert.equal(observed, { key: 'prod-key', secret: 'prod-secret', region: 'us-west-2' })
    // Restored after fn
    assert.is(process.env.AWS_ACCESS_KEY_ID, 'default-key')
    assert.is(process.env.AWS_SECRET_ACCESS_KEY, 'default-secret')
    assert.is(process.env.AWS_REGION, 'us-east-1')
  } finally {
    tearDown()
  }
})

test('useCredentials: restores env even when fn throws', async () => {
  setUp()
  try {
    process.env.AWS_ACCESS_KEY_ID = 'default-key'
    process.env.PROD_AWS_ACCESS_KEY_ID = 'prod-key'
    process.env.PROD_AWS_SECRET_ACCESS_KEY = 'prod-secret'

    try {
      await useCredentials('prod', async () => {
        throw new Error('boom')
      })
      assert.unreachable('should have rethrown')
    } catch (err) {
      assert.is(err.message, 'boom')
    }

    assert.is(process.env.AWS_ACCESS_KEY_ID, 'default-key')
  } finally {
    tearDown()
  }
})

test('useCredentials: throws on unknown account with helpful message', async () => {
  setUp()
  try {
    process.env.PROD_AWS_ACCESS_KEY_ID = 'a'
    process.env.PROD_AWS_SECRET_ACCESS_KEY = 'b'

    try {
      await useCredentials('does-not-exist', async () => 'never')
      assert.unreachable('should have thrown')
    } catch (err) {
      assert.ok(err.message.includes('No credentials found for account "does-not-exist"'))
      assert.ok(err.message.includes('prod'), 'should list available accounts')
    }
  } finally {
    tearDown()
  }
})

test('useCredentials: "default" short-circuits when no swap needed', async () => {
  setUp()
  try {
    // No env vars at all → 'default' should short-circuit without throwing
    let called = false
    const result = await useCredentials('default', async () => {
      called = true
      return 'ok'
    })
    assert.is(result, 'ok')
    assert.ok(called)
  } finally {
    tearDown()
  }
})

test('useCredentials: same account allows concurrent holders (refcount)', async () => {
  setUp()
  try {
    process.env.PROD_AWS_ACCESS_KEY_ID = 'prod-key'
    process.env.PROD_AWS_SECRET_ACCESS_KEY = 'prod-secret'

    let bothActive = false
    let firstObserved
    let secondObserved

    const first = useCredentials('prod', async () => {
      firstObserved = process.env.AWS_ACCESS_KEY_ID
      // Wait for second to start
      await new Promise(r => setTimeout(r, 30))
      bothActive = true
    })

    // Give first a moment to acquire the lock
    await new Promise(r => setTimeout(r, 5))

    const second = useCredentials('prod', async () => {
      secondObserved = process.env.AWS_ACCESS_KEY_ID
    })

    await Promise.all([first, second])

    assert.ok(bothActive, 'second should have run concurrently with first')
    assert.is(firstObserved, 'prod-key')
    assert.is(secondObserved, 'prod-key')
  } finally {
    tearDown()
  }
})

test('useCredentials: different accounts are serialized', async () => {
  setUp()
  try {
    process.env.PROD_AWS_ACCESS_KEY_ID = 'prod-key'
    process.env.PROD_AWS_SECRET_ACCESS_KEY = 'prod-secret'
    process.env.STAGING_AWS_ACCESS_KEY_ID = 'staging-key'
    process.env.STAGING_AWS_SECRET_ACCESS_KEY = 'staging-secret'

    const order = []

    const prod = useCredentials('prod', async () => {
      order.push('prod-start')
      await new Promise(r => setTimeout(r, 25))
      // While prod is mid-flight, staging must not have started swapping yet
      assert.is(process.env.AWS_ACCESS_KEY_ID, 'prod-key', 'staging should not have swapped yet')
      order.push('prod-end')
    })

    // Yield so prod gets the lock first
    await new Promise(r => setTimeout(r, 5))

    const staging = useCredentials('staging', async () => {
      order.push('staging-start')
      assert.is(process.env.AWS_ACCESS_KEY_ID, 'staging-key')
      order.push('staging-end')
    })

    await Promise.all([prod, staging])

    assert.equal(order, ['prod-start', 'prod-end', 'staging-start', 'staging-end'])
  } finally {
    tearDown()
  }
})

test('saveCurrentCredentials: snapshots only present AWS vars', () => {
  setUp()
  try {
    process.env.AWS_ACCESS_KEY_ID = 'key'
    process.env.AWS_REGION = 'us-east-1'
    // AWS_SECRET_ACCESS_KEY intentionally absent

    const snap = saveCurrentCredentials()
    assert.is(snap.AWS_ACCESS_KEY_ID, 'key')
    assert.is(snap.AWS_REGION, 'us-east-1')
    assert.not.ok('AWS_SECRET_ACCESS_KEY' in snap)
  } finally {
    tearDown()
  }
})

test.run()
