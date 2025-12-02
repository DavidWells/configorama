/**
 * Extract variable prefix/suffix from regex source
 * @param {string} syntaxSource - The regex source string (e.g., '\\$\\{(...)\\}')
 * @returns {{ prefix: string, suffix: string }} The unescaped prefix and suffix
 */
function extractVariableWrapper(syntaxSource) {
  // Find first capturing group ( that's not escaped and not a special group (?:, (?=, etc.)
  let openParen = -1
  for (let i = 0; i < syntaxSource.length; i++) {
    if (syntaxSource[i] === '(' && (i === 0 || syntaxSource[i - 1] !== '\\')) {
      // Check if it's a special group like (?:, (?=, (?!, (?<
      if (syntaxSource[i + 1] !== '?') {
        openParen = i
        break
      }
    }
  }

  // Find last ) that's not escaped
  let closeParen = -1
  for (let i = syntaxSource.length - 1; i >= 0; i--) {
    if (syntaxSource[i] === ')' && (i === 0 || syntaxSource[i - 1] !== '\\')) {
      closeParen = i
      break
    }
  }

  let escapedPrefix = openParen > 0 ? syntaxSource.substring(0, openParen) : ''
  const escapedSuffix = closeParen >= 0 ? syntaxSource.substring(closeParen + 1) : ''

  // Strip any leading non-capturing groups like (?:...) from prefix
  escapedPrefix = escapedPrefix.replace(/^\(\?:[^)]*\)/g, '')

  // Unescape regex escapes: \$ -> $, \{ -> {, \[ -> [, etc.
  const unescape = (s) => s.replace(/\\(.)/g, '$1')

  return {
    prefix: unescape(escapedPrefix) || '${',
    suffix: unescape(escapedSuffix) || '}'
  }
}

/**
 * Get fallback variable string
 * @param {string[]} split - Array from split at comma
 * @param {string} nestedVar - Fallback variable to reconstruct variable string from
 * @returns {string} New ${variable, string}
 */
function getFallbackString(split, nestedVar) {
  let isSet = false
  const newVar = split
    .reduce((acc, curr) => {
      if (curr === nestedVar || isSet) {
        acc = acc.concat(curr)
        isSet = true
      }
      return acc
    }, [])
    .join(', ')
  const cleanC = `\${${newVar.replace(/^\${/, '').replace(/}$/, '')}}`
  return cleanC
}

/**
 * Verify if variable string is valid
 */
function verifyVariable(variableString, valueObject, variableTypes, config) {
  const isRealVariable = variableTypes.some((r) => {
    if (r.match instanceof RegExp && variableString.match(r.match)) {
      return true
    } else if (typeof r.match === 'function') {
      if (r.match(variableString, config, valueObject)) {
        return true
      }
    }
    return false
  })
  
  if (!isRealVariable && variableString.match(/:/)) {
    throw new Error(`
Variable \${${variableString}} is invalid variable syntax.
Value Path: ${valueObject.path ? valueObject.path.join('.') : 'na'}
Original Value: ${valueObject.originalSource}

Remove or update the \${${variableString}} to fix
`)
  }
  return isRealVariable
}

module.exports = {
  extractVariableWrapper,
  getFallbackString,
  verifyVariable
} 