// Variable overrides: values supplied up front for variable refs (e.g. `git:commit`) so they resolve
// without running their resolver. Built from the `overrides` setting over the CONFIGORAMA_OVERRIDES env var.

const OVERRIDES_ENV = 'CONFIGORAMA_OVERRIDES'

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Build the overrides map. Setting entries beat env entries; null/undefined values are dropped.
 * The env value is never echoed in errors (it may hold secrets).
 * @param {Record<string, any>} [setting] - The `overrides` setting
 * @param {Record<string, string|undefined>} [env] - Environment to read CONFIGORAMA_OVERRIDES from
 * @returns {Record<string, any>}
 */
function buildOverrides(setting, env = process.env) {
  if (setting !== undefined && setting !== null && !isPlainObject(setting)) {
    throw new Error('The "overrides" setting must be an object of variable refs to values, e.g. { "git:commit": "abc123" }')
  }
  /** @type {Record<string, any>} */
  let fromEnv = {}
  const raw = env[OVERRIDES_ENV]
  if (raw !== undefined && raw.trim() !== '') {
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      parsed = undefined
    }
    if (!isPlainObject(parsed)) {
      throw new Error(`${OVERRIDES_ENV} must be a JSON object of variable refs to values, e.g. {"git:commit":"abc123"}`)
    }
    fromEnv = parsed
  }
  /** @type {Record<string, any>} */
  const overrides = {}
  for (const source of [fromEnv, setting || {}]) {
    for (const [ref, value] of Object.entries(source)) {
      if (value === undefined || value === null) continue
      overrides[ref.trim()] = value
    }
  }
  return overrides
}

/**
 * Override value for a variable, or undefined when none applies. A resolver's optional
 * `override(variableString, overrides)` hook runs first (it can map aliases, normalise or derive values);
 * otherwise an exact ref match is used.
 * @param {{ override?: (variableString: string, overrides: Record<string, any>) => any } | undefined} resolverEntry
 * @param {string} variableString - The variable ref being resolved, e.g. `git:commit`
 * @param {Record<string, any>} overrides - Map from buildOverrides
 * @returns {any}
 */
function overrideFor(resolverEntry, variableString, overrides) {
  if (!overrides || !Object.keys(overrides).length) return undefined
  if (resolverEntry && typeof resolverEntry.override === 'function') {
    const hooked = resolverEntry.override(variableString, overrides)
    if (hooked !== undefined) return hooked
  }
  const ref = variableString.trim()
  return Object.prototype.hasOwnProperty.call(overrides, ref) ? overrides[ref] : undefined
}

module.exports = {
  OVERRIDES_ENV,
  buildOverrides,
  overrideFor,
}
