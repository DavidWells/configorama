/* 1Password variable source for configorama
   Resolves ${op:alias} and ${op(item)} references through the op CLI */
const { readSecretRef, getItem } = require('./op-cli')
const { validateAliasName, normalizeRefValue, isItemId } = require('./normalize')
const { selectField, trySelectField } = require('./fields')
const { parseStructuredSecret, getKeyPath } = require('./parser')

const OP_PREFIX = 'op'

/**
 * Tell interactive users why an authorization prompt is about to appear,
 * naming what is being fetched. The 1Password dialog only names the terminal
 * app (OS-attributed), so this line supplies the configorama context. Labels
 * are config keys / aliases / fields — references, never secret values.
 * TTY-only: silent in CI and pipes.
 * @param {string[]} labels - Human labels for the values being fetched
 * @param {string} programName - Host tool name shown as the message prefix
 */
function logAuthHint(labels, programName) {
  if (!process.stderr.isTTY) return
  const unique = [...new Set(labels)]
  const n = unique.length
  const what = n > 0 && n <= 8 ? unique.join(', ') : `${n} value${n === 1 ? '' : 's'}`
  process.stderr.write(`${programName}: fetching ${what} from 1Password (expect an authorization prompt)\n`)
}
// Supports: op:alias, op:alias.KEY, op(item), op(item).KEY
const opVariableSyntax = /^op(?::|\()/

/**
 * Creates a 1Password variable source resolver.
 *
 * Syntax:
 *   ${op:alias}            — alias from refs, raw selected field
 *   ${op:alias.KEY}        — alias, INI/dotenv key path into the field
 *   ${op(spec)}            — direct item ID/name, op:// ref, or private link
 *   ${op(spec).KEY}        — direct spec with key path
 *
 * Colon syntax is reserved for aliases; raw op:// refs and links must use
 * function syntax so the parser has a reliable spec boundary.
 *
 * @param {object} options - Configuration options
 * @param {object} [options.refs] - Alias map: name -> string ref, item name, private link, or { item, vault, section, field } / { ref } / { url }
 * @param {string} [options.account] - Passed to op as --account
 * @param {string} [options.configDir] - Passed to op as --config
 * @param {string} [options.opPath] - Path to the op binary (defaults to "op" on PATH)
 * @param {string} [options.programName] - Host tool name for the auth-prompt hint (defaults to $CONFIGORAMA_PROGRAM_NAME or "configorama")
 * @param {boolean} [options.skipResolution] - Collect metadata and return placeholders without calling op
 * @param {object} [options.cache] - Optional cache provider config ({ provider: 'op-cache', ttlSeconds, scope, fallbackToOp, allowServiceAccountTokenCache })
 * @param {Function} [options.execFile] - execFile injection for tests (not serializable; unavailable in sync mode)
 * @returns {object} Variable source configuration with resolver and metadata collector
 */
function createOnePasswordResolver(options = {}) {
  const {
    refs = {},
    account,
    configDir,
    opPath,
    programName,
    skipResolution = false,
    cache,
    execFile,
  } = options

  const opCache = cache && cache.provider === 'op-cache' ? loadOpCache() : undefined

  const aliasRefs = {}
  for (const alias of Object.keys(refs)) {
    validateAliasName(alias)
    aliasRefs[alias] = normalizeRefValue(refs[alias])
  }

  const opReferences = []
  // Caches hold in-flight promises so concurrent references to the same
  // item/ref share one op call. Failed promises are evicted immediately,
  // so auth/not-found/parse failures are never cached.
  const secretRefCache = new Map()
  const itemCache = new Map()

  const cliOptions = { account, configDir, opPath, execFile }
  const scopeKey = `${account || ''}|${configDir || ''}`

  /**
   * @param {Map} cache - Promise cache
   * @param {string} key - Cache key
   * @param {Function} fn - Producer returning a promise
   * @param {string} [label] - Human label for the auth hint
   * @returns {Promise<*>} Shared promise
   */
  function cached(cache, key, fn, label) {
    if (cache.has(key)) {
      return cache.get(key)
    }
    const promise = withColdStartLatch(fn, label).catch((err) => {
      cache.delete(key)
      throw err
    })
    cache.set(key, promise)
    return promise
  }

  // 1Password app-integration auth prompts once per op PROCESS until a
  // session exists. Parallel resolution of N distinct items would spawn N
  // processes at cold start and trigger N biometric prompts, so the first
  // op call runs alone; everything else queues behind its settlement and
  // then fans out in parallel against the authorized session.
  let coldStartCall = null
  let hintScheduled = false
  const pendingLabels = []

  /**
   * @param {Function} fn - Producer returning a promise
   * @param {string} [label] - Human label for the auth hint
   * @returns {Promise<*>} Producer result, gated behind the first call
   */
  function withColdStartLatch(fn, label) {
    if (label) pendingLabels.push(label)
    if (!hintScheduled) {
      hintScheduled = true
      // setImmediate lets the whole parallel fan-out register first so the
      // hint names every value being fetched. The prefix is read here (not at
      // factory time) so a host tool can set CONFIGORAMA_PROGRAM_NAME after the
      // resolver is constructed but before resolution runs.
      setImmediate(() => {
        const prefix = programName || process.env.CONFIGORAMA_PROGRAM_NAME || 'configorama'
        logAuthHint(pendingLabels, prefix)
      })
    }
    if (!coldStartCall) {
      coldStartCall = fn()
      return coldStartCall
    }
    return coldStartCall.catch(() => {}).then(fn)
  }

  /**
   * Parse an op variable string into its reference and key path.
   * @param {string} varString - e.g. "op:npm.NPM_TOKEN" or "op(item-id).KEY"
   * @returns {{reference: object, keyPath: string|undefined, alias: string|undefined}} Parsed parts
   */
  function parseVariable(varString) {
    const trimmed = varString.trim()

    const funcMatch = trimmed.match(/^op\((.*)\)(?:\.(.+))?$/)
    if (funcMatch) {
      const spec = funcMatch[1].trim()
      if (!spec) {
        throw new Error(`Invalid 1Password reference "${varString}". Expected \${op(item)}, \${op(op://vault/item/field)}, or a private link.`)
      }
      return { reference: normalizeRefValue(spec), keyPath: funcMatch[2], alias: undefined }
    }

    // Bare 1Password secret reference: ${op://vault/item/field}. This is the
    // native op:// URI and is treated as a direct secret ref (op read). Key
    // paths are not supported here because op:// refs contain dots and slashes;
    // use alias or function syntax for a structured-note key path.
    if (trimmed.startsWith('op://')) {
      return { reference: { kind: 'secretRef', ref: trimmed }, keyPath: undefined, alias: undefined }
    }

    if (!trimmed.startsWith('op:')) {
      throw new Error(`Invalid 1Password variable "${varString}".`)
    }
    const rest = trimmed.slice(3)
    if (rest.startsWith('op://')) {
      throw new Error(`Use \${op(${rest})} for direct secret references.`)
    }
    // A private link (or any URL) after the colon is a common mistake — colon
    // syntax is alias-only. Point to function syntax without echoing the link
    // (it carries account/host params we treat as sensitive).
    if (/^https?:\/\//.test(rest) || rest.startsWith('onepassword://')) {
      throw new Error('1Password private links are not supported in colon syntax. Use function syntax: ${op(<private link>)}, or an op:// secret reference.')
    }

    const dotIndex = rest.indexOf('.')
    const alias = dotIndex === -1 ? rest : rest.slice(0, dotIndex)
    const keyPath = dotIndex === -1 ? undefined : rest.slice(dotIndex + 1)

    validateAliasName(alias)
    const reference = aliasRefs[alias]
    if (reference) {
      return { reference, keyPath, alias }
    }
    // Not a configured alias. A bare 1Password item ID (26-char base32) is
    // unambiguous, so accept it as a direct item reference. Configured aliases
    // always take precedence (checked above), so this only affects strings that
    // would otherwise error as an unknown alias.
    if (isItemId(alias)) {
      return {
        reference: { kind: 'item', item: alias, vault: undefined, section: undefined, field: undefined },
        keyPath,
        alias: undefined,
      }
    }
    throw new Error(`Unknown 1Password alias "${alias}". Configure refs.${alias}.`)
  }

  /**
   * @param {object} params - { reference, keyPath, alias }
   * @returns {string} Deterministic placeholder (never links or secrets)
   */
  function placeholderFor({ reference, keyPath, alias }) {
    if (alias) {
      return `[OP:alias:${alias}${keyPath ? `.${keyPath}` : ''}]`
    }
    if (reference.kind === 'secretRef') {
      return `[OP:secretRef:${reference.ref}]`
    }
    if (reference.kind === 'privateLink') {
      return `[OP:privateLink:${reference.item}]`
    }
    return `[OP:item:${reference.item}${keyPath ? `:${keyPath}` : ''}]`
  }

  /**
   * Fetch and select the backing field value for a normalized reference.
   * For items without a configured field, the first key path segment may
   * select a field directly: ${op(My Login).password} picks the password
   * field, while ${op(note-item).NPM_TOKEN} falls back to inference and
   * treats NPM_TOKEN as an INI key inside the inferred field.
   * @param {object} reference - Normalized reference
   * @param {string|undefined} keyPath - Requested key path
   * @param {string} [label] - Human label for the auth hint
   * @returns {Promise<{value: string, fieldName: string, remainingKeyPath: string|undefined}>} Selected value
   */
  async function fetchValue(reference, keyPath, label) {
    if (reference.kind === 'secretRef') {
      const value = await cached(secretRefCache, `${scopeKey}|${reference.ref}`, () => {
        return readSecretRefWithOptionalCache(reference.ref)
      }, label)
      return { value, fieldName: reference.ref, remainingKeyPath: keyPath }
    }

    const vault = reference.vault
    const itemKey = `${scopeKey}|${vault || ''}|${reference.item}`
    const item = await cached(itemCache, itemKey, () => {
      return getItem(reference.item, { ...cliOptions, vault })
    }, label)

    // Field selection is a pure function over the cached item JSON, so it
    // needs no cache of its own - no op call is ever saved by one.
    if (reference.field) {
      const field = selectField(item, { field: reference.field, section: reference.section })
      return { value: field.value, fieldName: field.label || field.id, remainingKeyPath: keyPath }
    }

    if (keyPath !== undefined) {
      const dotIndex = keyPath.indexOf('.')
      const firstSegment = dotIndex === -1 ? keyPath : keyPath.slice(0, dotIndex)
      const fieldMatch = trySelectField(item, { field: firstSegment })
      if (fieldMatch) {
        const remaining = dotIndex === -1 ? undefined : keyPath.slice(dotIndex + 1)
        return { value: fieldMatch.value, fieldName: fieldMatch.label || fieldMatch.id, remainingKeyPath: remaining }
      }
    }

    const field = selectField(item, {})
    return { value: field.value, fieldName: field.label || field.id, remainingKeyPath: keyPath }
  }

  /**
   * @param {string} varString - Variable body without ${}
   * @param {object} opts - Resolver options from core (unused)
   * @param {object} currentObject - Config object being populated (unused)
   * @param {object} valueObject - Core value context ({ originalSource, path })
   * @returns {Promise<string>} Resolved value or placeholder
   */
  async function resolver(varString, opts, currentObject, valueObject) {
    const parsed = parseVariable(varString)
    const { reference, keyPath, alias } = parsed
    const configPath = valueObject && valueObject.path ? valueObject.path.join('.') : undefined

    // Direct private links put the full URL (with account/host params) in
    // the variable string itself - redact it from opReferences entries.
    const isDirectLink = reference.kind === 'privateLink' && !alias
    const redacted = `\${op(...)${keyPath ? `.${keyPath}` : ''}}`
    const entry = {
      raw: isDirectLink ? redacted : (valueObject ? valueObject.originalSource : `\${${varString}}`),
      resolved: isDirectLink ? redacted : `\${${varString}}`,
      alias,
      referenceKind: reference.kind,
      ref: reference.kind === 'secretRef' ? reference.ref : undefined,
      item: reference.item,
      vault: reference.vault,
      field: reference.field,
      section: reference.section,
      keyPath,
      configPath,
      sensitive: true,
      risk: 'remote_secret_read',
      source: 'remote',
      skipped: skipResolution === true,
    }
    if (reference.warnings && reference.warnings.length) {
      entry.diagnostics = reference.warnings.map((warning) => ({ ...warning, configPath }))
    }
    opReferences.push(entry)

    if (skipResolution) {
      return placeholderFor(parsed)
    }

    // Auth-hint label: what the user recognizes — the alias, else the config
    // key being set, else the field. Never a secret value.
    const label = alias
      || (configPath ? configPath.split('.').pop() : undefined)
      || reference.field
      || (reference.kind === 'secretRef' ? reference.ref : reference.item)
    const { value, fieldName, remainingKeyPath } = await fetchValue(reference, keyPath, label)
    if (entry.field === undefined && reference.kind !== 'secretRef') {
      entry.field = fieldName
    }

    if (remainingKeyPath === undefined) {
      return value
    }
    const parsedValue = parseStructuredSecret(value, { fieldName })
    return getKeyPath(parsedValue, remainingKeyPath, fieldName)
  }

  return {
    type: OP_PREFIX,
    source: 'remote',
    prefix: OP_PREFIX,
    syntax: '${op:alias.KEY}, ${op(item).KEY}, or ${op(op://vault/item/field)}',
    description: 'Resolves values from 1Password through the op CLI',
    sensitive: true,
    risk: 'remote_secret_read',
    match: opVariableSyntax,
    resolver,
    metadataKey: 'opReferences',
    collectMetadata: () => opReferences,
    clearCache: () => {
      secretRefCache.clear()
      itemCache.clear()
      opReferences.length = 0
      coldStartCall = null
      hintScheduled = false
      pendingLabels.length = 0
    },
    syncFactory: require.resolve('./sync-factory'),
    syncOptions: buildSyncOptions(),
  }

  /**
   * @returns {object} JSON-serializable options for the sync worker
   */
  function buildSyncOptions() {
    const syncOptions = { refs, account, configDir, opPath, skipResolution }
    if (cache !== undefined) syncOptions.cache = cache
    if (execFile) {
      // Functions cannot cross the JSON boundary into the sync worker;
      // flag it so sync-factory can fail loudly instead of silently
      // running the real op binary.
      syncOptions.hasInjectedExecFile = true
    }
    return syncOptions
  }

  /**
   * @param {string} ref - Direct op:// secret reference
   * @returns {Promise<string>} Secret value
   */
  function readSecretRefWithOptionalCache(ref) {
    if (!opCache || shouldBypassOpCache()) {
      return readSecretRef(ref, cliOptions)
    }
    return opCache.read(ref, {
      account,
      configDir,
      opPath,
      ttlSeconds: cache.ttlSeconds,
      scope: cache.scope,
      fallbackToOp: cache.fallbackToOp === true,
      stderr: process.stderr,
    })
  }

  /**
   * @returns {boolean} Whether cache must be bypassed for this read
   */
  function shouldBypassOpCache() {
    if (process.env.OP_CACHE_DISABLED === '1') return true
    if (execFile) return true
    if (process.env.OP_SERVICE_ACCOUNT_TOKEN && !(cache && cache.allowServiceAccountTokenCache === true)) {
      return true
    }
    return false
  }
}

/**
 * @returns {object} @davidwells/op-cache API
 */
function loadOpCache() {
  try {
    return require('@davidwells/op-cache')
  } catch (err) {
    throw new Error('1Password op-cache provider requested but @davidwells/op-cache is not installed. Install it with: npm install @davidwells/op-cache')
  }
}

module.exports = createOnePasswordResolver
module.exports.opVariableSyntax = opVariableSyntax
