// Registry of stable error codes emitted on `error.code` and in `--error-format json`.
// Single source of truth for the codes referenced by classifyErrorMessage and thrown
// directly as ConfigoramaError; surfaced by `configorama capabilities`.
const ERROR_CODES = [
  { code: 'missing_env', description: 'A referenced environment variable was not set and had no fallback.' },
  { code: 'missing_file', description: 'A referenced file could not be found on disk.' },
  { code: 'unresolved_variable', description: 'A variable could not be resolved to a value.' },
  { code: 'unknown_filter', description: 'A pipe filter name is not registered.' },
  { code: 'invalid_variable_syntax', description: 'A variable reference is malformed.' },
  { code: 'circular_dependency', description: 'Variables reference each other in a cycle.' },
  { code: 'invalid_view', description: 'An unknown --view was passed to the inspect command.' },
  { code: 'blocked_by_safe_mode', description: 'An executable or mutating reference was blocked by --safe.' },
  { code: 'file_root_forbidden', description: 'A file/text reference resolved outside an allowed --safe-root.' },
  { code: 'unknown_command', description: 'The first argument was not a recognized command.' },
  { code: 'no_input_file', description: 'No config file was provided on the command line.' },
  { code: 'file_not_found', description: 'The provided config file path does not exist.' },
  { code: 'path_not_found', description: 'A jq-style extraction path matched nothing in the resolved config.' },
  { code: 'configorama_error', description: 'Generic, unclassified configorama error.' },
]

class ConfigoramaError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ConfigoramaError'
    this.code = code || 'configorama_error'
    this.details = details
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details || {},
      }
    }
  }
}

function isConfigoramaError(error) {
  return !!(error && error.name === 'ConfigoramaError' && error.code)
}

function normalizeError(error, fallbackCode = 'configorama_error') {
  if (isConfigoramaError(error)) return error
  const code = error && error.code ? error.code : classifyErrorMessage(error && error.message, fallbackCode)
  return new ConfigoramaError(
    code,
    error && error.message ? error.message : String(error),
    error && error.details ? error.details : {}
  )
}

function classifyErrorMessage(message, fallbackCode = 'configorama_error') {
  const text = String(message || '')
  if (/Filter ".+" not found/.test(text)) return 'unknown_filter'
  if (/Unable to resolve config variable/.test(text) && /env:/.test(text)) return 'missing_env'
  if (/Unable to resolve config variable/.test(text)) return 'unresolved_variable'
  if (/File not found|cannot resolve due to missing file/i.test(text)) return 'missing_file'
  if (/Invalid variable reference syntax/.test(text)) return 'invalid_variable_syntax'
  if (/Circular variable dependency/.test(text)) return 'circular_dependency'
  return fallbackCode
}

module.exports = {
  ERROR_CODES,
  ConfigoramaError,
  classifyErrorMessage,
  isConfigoramaError,
  normalizeError,
}
