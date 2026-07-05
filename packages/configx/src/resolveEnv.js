/* Maps a resolved configorama config into a child-process environment
   Validates key names, converts scalars, and lets parent env win */

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Error carrying a stable code for CLI handling.
 */
class ConfigxError extends Error {
  /**
   * @param {string} code - Stable error code
   * @param {string} message - Human-readable message (never a secret value)
   */
  constructor(code, message) {
    super(message)
    this.name = 'ConfigxError'
    this.code = code
  }
}

/**
 * @param {*} value - Resolved config value
 * @returns {string} Type label for error messages
 */
function typeLabel(value) {
  return Array.isArray(value) ? 'array' : typeof value
}

/**
 * Validate a resolved config and return its scalar entries as strings.
 * Skips null/undefined; rejects bad key names and non-scalar values.
 * Errors name the offending key and type but never the value.
 * @param {object} resolvedConfig - Fully resolved top-level config object
 * @returns {Array<[string, string]>} Validated [key, stringValue] pairs
 */
function configEntries(resolvedConfig) {
  const entries = []
  for (const key of Object.keys(resolvedConfig || {})) {
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new ConfigxError('invalid_exec_env_key', `Config key "${key}" is not a portable environment variable name (must match ${ENV_KEY_PATTERN}).`)
    }

    const value = resolvedConfig[key]
    if (value === null || value === undefined) continue

    const type = typeof value
    if (type !== 'string' && type !== 'number' && type !== 'boolean') {
      throw new ConfigxError('invalid_exec_env_value', `Config key "${key}" has a non-scalar value of type ${typeLabel(value)}; only string, number, and boolean map to environment variables.`)
    }

    entries.push([key, String(value)])
  }
  return entries
}

/**
 * Build the child environment from a resolved config and a base environment.
 * Top-level scalar keys are added only when absent from baseEnv (parent wins).
 * @param {object} resolvedConfig - Fully resolved top-level config object
 * @param {object} baseEnv - Parent environment (e.g. process.env), not mutated
 * @returns {object} New environment object for the child process
 */
function resolveEnv(resolvedConfig, baseEnv) {
  const childEnv = Object.assign({}, baseEnv)
  for (const [key, value] of configEntries(resolvedConfig)) {
    if (Object.prototype.hasOwnProperty.call(childEnv, key)) continue
    childEnv[key] = value
  }
  return childEnv
}

/**
 * Format validated entries as POSIX `export` lines for `eval`/`source`.
 * Values are single-quoted and embedded single quotes escaped as '\'', so
 * no shell metacharacter in a value can execute — everything stays a literal
 * string. This is the injection boundary; keep it strict.
 * @param {Array<[string, string]>} entries - Validated [key, value] pairs
 * @returns {string} Newline-joined export statements
 */
function shellExport(entries) {
  return entries
    .map(([key, value]) => `export ${key}='${value.replace(/'/g, "'\\''")}'`)
    .join('\n')
}

module.exports = { resolveEnv, configEntries, shellExport, ConfigxError, ENV_KEY_PATTERN }
