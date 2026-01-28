/**
 * Warns if a variable value is not found during resolution
 */
const { isEmpty } = require('../lodash')

/**
 * @param {*} val
 * @returns {boolean}
 */
function isValidValue(val) {
  if (val !== null && typeof val === 'object' && (val.hasOwnProperty('__internal_only_flag') || val.hasOwnProperty('__internal_metadata'))) {
    return false
  }
  return val !== null && typeof val !== 'undefined' && !(typeof val === 'object' && isEmpty(val))
}

/**
 * Check if variable resolved to valid value, log warning if not
 * @param {string} variableString - The variable being resolved
 * @param {*} valueToPopulate - The resolved value
 * @param {object} [options] - Configuration options
 * @param {object} [options.patterns] - Regex patterns for variable types
 * @param {boolean} [options.debug] - Whether to log warnings
 * @returns {*} The valueToPopulate unchanged
 */
function warnIfNotFound(variableString, valueToPopulate, options = {}) {
  const { patterns = {}, debug = false } = options

  let variableTypeText
  if (patterns.env && variableString.match(patterns.env)) {
    variableTypeText = 'environment variable'
  } else if (patterns.opt && variableString.match(patterns.opt)) {
    variableTypeText = 'option'
  } else if (patterns.self && variableString.match(patterns.self)) {
    variableTypeText = 'config attribute'
  } else if (patterns.file && variableString.match(patterns.file)) {
    variableTypeText = 'file'
  } else if (patterns.deep && variableString.match(patterns.deep)) {
    variableTypeText = 'deep'
  } else if (patterns.text && variableString.match(patterns.text)) {
    variableTypeText = 'text'
  }

  if (!isValidValue(valueToPopulate)) {
    const notFoundMsg = `No ${variableTypeText} found to satisfy the '\${${variableString}}' variable. Attempting fallback value`
    if (debug) {
      console.log(notFoundMsg)
    }
  }
  return valueToPopulate
}

module.exports = {
  warnIfNotFound,
  isValidValue
}
