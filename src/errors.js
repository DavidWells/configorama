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
  ConfigoramaError,
  classifyErrorMessage,
  isConfigoramaError,
  normalizeError,
}
