const dotProp = require('dot-prop')

const REDACTED_VALUE = '********'

const DEFAULT_SENSITIVE_PATTERNS = [
  /secret/i,
  /password/i,
  /token/i,
  /key/i,
  /credential/i,
  /auth/i,
  /private[-_]?key/i,
  /client[-_]?secret/i,
]

function cloneJson(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function toRegex(pattern) {
  if (pattern instanceof RegExp) return pattern
  return new RegExp(String(pattern), 'i')
}

function getSensitivePatterns(options = {}) {
  const customPatterns = (options.patterns || options.sensitivePatterns || []).map(toRegex)
  return DEFAULT_SENSITIVE_PATTERNS.concat(customPatterns)
}

function isSensitiveName(name, options = {}) {
  if (!name) return false
  const value = String(name)
  return getSensitivePatterns(options).some(pattern => pattern.test(value))
}

function getSensitiveOverride(entries = []) {
  const entry = entries.find(item => item && typeof item.value === 'boolean')
  if (!entry) return null
  return entry.value
}

function isSensitiveVariable(name, options = {}) {
  const override = getSensitiveOverride(options.sensitiveEntries || [])
  if (override !== null) return override
  return isSensitiveName(name, options) || isSensitiveName(options.path, options)
}

function redactValue(value) {
  if (value === undefined) return undefined
  return REDACTED_VALUE
}

function redactObjectByPaths(value, paths = []) {
  const redacted = cloneJson(value)
  for (const configPath of paths || []) {
    if (configPath && dotProp.has(redacted, configPath)) {
      dotProp.set(redacted, configPath, REDACTED_VALUE)
    }
  }
  return redacted
}

function redactRequirementValue(requirement, value) {
  return requirement && requirement.sensitive === true ? REDACTED_VALUE : value
}

module.exports = {
  DEFAULT_SENSITIVE_PATTERNS,
  REDACTED_VALUE,
  cloneJson,
  getSensitivePatterns,
  isSensitiveName,
  isSensitiveVariable,
  redactObjectByPaths,
  redactRequirementValue,
  redactValue,
}
