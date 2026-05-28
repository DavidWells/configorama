/* AWS credential discovery and runtime swapping for multi-account deployments */

const AWS_CRED_SUFFIXES = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_REGION'
]

/** @type {Map<string, Object>|null} */
let credentialCache = null

// Mutex state for credential swapping (prevents race conditions in parallel deploys)
/** @type {string|null} */
let activeAccount = null
/** @type {number} */
let activeRefCount = 0
/** @type {Promise<void>|null} */
let lockPromise = null
/** @type {Function|null} */
let lockResolve = null

/**
 * @typedef {Object} AwsCredentials
 * @property {string} [AWS_ACCESS_KEY_ID]
 * @property {string} [AWS_SECRET_ACCESS_KEY]
 * @property {string} [AWS_SESSION_TOKEN]
 * @property {string} [AWS_REGION]
 */

/**
 * Discover all credential sets from env vars matching {PREFIX}_AWS_ACCESS_KEY_ID.
 * E.g., STAGING_AWS_ACCESS_KEY_ID, PROD_AWS_ACCESS_KEY_ID -> "staging", "prod".
 *
 * @returns {Map<string, AwsCredentials>} Map of account alias -> credentials
 */
function discoverCredentialSets() {
  if (credentialCache) return credentialCache

  const sets = new Map()
  const pattern = /^(.+)_AWS_ACCESS_KEY_ID$/

  for (const key of Object.keys(process.env)) {
    const match = key.match(pattern)
    if (match) {
      const prefix = match[1]
      const name = prefix.toLowerCase()

      sets.set(name, {
        AWS_ACCESS_KEY_ID: process.env[`${prefix}_AWS_ACCESS_KEY_ID`],
        AWS_SECRET_ACCESS_KEY: process.env[`${prefix}_AWS_SECRET_ACCESS_KEY`],
        AWS_SESSION_TOKEN: process.env[`${prefix}_AWS_SESSION_TOKEN`],
        AWS_REGION: process.env[`${prefix}_AWS_REGION`] || process.env.AWS_REGION,
      })
    }
  }

  // Capture "default" from unprefixed vars if present and not already discovered
  if (process.env.AWS_ACCESS_KEY_ID && !sets.has('default')) {
    sets.set('default', {
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
      AWS_REGION: process.env.AWS_REGION,
    })
  }

  // Auto-default: if no unprefixed creds but exactly one prefixed set, use it as default
  if (!sets.has('default') && sets.size === 1) {
    const [, creds] = [...sets.entries()][0]
    sets.set('default', creds)
    for (const [key, value] of Object.entries(creds)) {
      if (value && !process.env[key]) {
        process.env[key] = value
      }
    }
  }

  credentialCache = sets
  return sets
}

/**
 * Get available account aliases.
 * @returns {string[]}
 */
function getAvailableAccounts() {
  return [...discoverCredentialSets().keys()]
}

/**
 * Check if credentials exist for an account alias.
 * @param {string} account
 * @returns {boolean}
 */
function hasCredentials(account) {
  return discoverCredentialSets().has(account.toLowerCase())
}

/**
 * Get credentials for an account alias.
 * @param {string} account
 * @returns {AwsCredentials|null}
 */
function getCredentials(account) {
  return discoverCredentialSets().get(account.toLowerCase()) || null
}

/**
 * Snapshot current AWS env vars so they can be restored after a swap.
 * @returns {AwsCredentials}
 */
function saveCurrentCredentials() {
  const creds = {}
  for (const suffix of AWS_CRED_SUFFIXES) {
    if (process.env[suffix]) {
      creds[suffix] = process.env[suffix]
    }
  }
  return creds
}

/**
 * Replace AWS env vars with the supplied credentials.
 * @param {AwsCredentials} creds
 */
function applyCredentials(creds) {
  for (const suffix of AWS_CRED_SUFFIXES) {
    delete process.env[suffix]
  }
  for (const [key, value] of Object.entries(creds)) {
    if (value) process.env[key] = value
  }
}

/**
 * Acquire credential lock for an account.
 * Same account can have multiple concurrent holders (refcounted).
 * Different account must wait for current holders to release.
 *
 * @param {string} account
 */
async function acquireLock(account) {
  while (activeAccount !== null && activeAccount !== account) {
    if (lockPromise) {
      await lockPromise
    }
  }

  if (activeAccount === null) {
    activeAccount = account
    lockPromise = new Promise(resolve => { lockResolve = resolve })
  }
  activeRefCount++
}

/**
 * Release credential lock.
 */
function releaseLock() {
  activeRefCount--
  if (activeRefCount === 0) {
    activeAccount = null
    if (lockResolve) {
      lockResolve()
      lockResolve = null
      lockPromise = null
    }
  }
}

/**
 * Execute a function with specific account credentials.
 * Uses a refcounted mutex so multiple resolves for the same account run in
 * parallel but different accounts are serialized — env vars are global, so two
 * accounts can't be active at once.
 *
 * @template T
 * @param {string} account - Account alias (matches {ACCOUNT}_AWS_ACCESS_KEY_ID prefix, case-insensitive)
 * @param {() => Promise<T>} fn - Async function to execute with swapped credentials
 * @returns {Promise<T>}
 */
async function useCredentials(account, fn) {
  const accountLower = account.toLowerCase()
  const sets = discoverCredentialSets()

  // If requesting default and we have unprefixed creds already active, no swap needed
  if (accountLower === 'default' && !sets.has('default')) {
    return fn()
  }

  const targetCreds = sets.get(accountLower)
  if (!targetCreds) {
    const available = [...sets.keys()].join(', ') || 'none'
    throw new Error(`No credentials found for account "${account}". Available: ${available}`)
  }

  await acquireLock(accountLower)
  const savedCreds = saveCurrentCredentials()

  try {
    applyCredentials(targetCreds)
    return await fn()
  } finally {
    applyCredentials(savedCreds)
    releaseLock()
  }
}

/**
 * Clear the credential cache and reset mutex state (useful for testing).
 */
function clearCache() {
  credentialCache = null
  activeAccount = null
  activeRefCount = 0
  lockPromise = null
  lockResolve = null
}

module.exports = {
  discoverCredentialSets,
  getAvailableAccounts,
  hasCredentials,
  getCredentials,
  useCredentials,
  clearCache,
  // Low-level (exported for testing)
  saveCurrentCredentials,
  applyCredentials,
}
