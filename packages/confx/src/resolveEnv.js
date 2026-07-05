/* Maps a resolved configorama config into a child-process environment
   Validates key names, converts scalars, and lets parent env win */

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Error carrying a stable code for CLI handling.
 */
class ConfxError extends Error {
  /**
   * @param {string} code - Stable error code
   * @param {string} message - Human-readable message (never a secret value)
   */
  constructor(code, message) {
    super(message)
    this.name = 'ConfxError'
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
 * Build the child environment from a resolved config and a base environment.
 * Top-level scalar keys are added only when absent from baseEnv (parent wins).
 * Errors name the offending key and type but never the value.
 * @param {object} resolvedConfig - Fully resolved top-level config object
 * @param {object} baseEnv - Parent environment (e.g. process.env), not mutated
 * @returns {object} New environment object for the child process
 */
function resolveEnv(resolvedConfig, baseEnv) {
  const childEnv = Object.assign({}, baseEnv)

  for (const key of Object.keys(resolvedConfig || {})) {
    if (!ENV_KEY_PATTERN.test(key)) {
      throw new ConfxError('invalid_exec_env_key', `Config key "${key}" is not a portable environment variable name (must match ${ENV_KEY_PATTERN}).`)
    }

    const value = resolvedConfig[key]
    if (value === null || value === undefined) continue

    const type = typeof value
    if (type !== 'string' && type !== 'number' && type !== 'boolean') {
      throw new ConfxError('invalid_exec_env_value', `Config key "${key}" has a non-scalar value of type ${typeLabel(value)}; only string, number, and boolean map to environment variables.`)
    }

    if (Object.prototype.hasOwnProperty.call(childEnv, key)) continue
    childEnv[key] = String(value)
  }

  return childEnv
}

module.exports = { resolveEnv, ConfxError, ENV_KEY_PATTERN }
