// Utility to determine variable type from variable string using resolver definitions

const fallbackMap = {
  opt: 'options',
  file: 'file',
  text: 'text',
}

/**
 * Determines the type of a variable by matching against resolver definitions
 * @param {string} varString - The variable string (without ${})
 * @param {Array} variableTypes - Array of variable type definitions with match regex and type
 * @returns {string} The type field from the matching resolver, or 'dot.prop' as fallback
 */
function getVariableType(varString, variableTypes) {
  if (!varString || !variableTypes) {
    // if no variable types passed, try to guess the type from the variable string
    if (!variableTypes) {
      const unWrappedVarString = varString.replace(/^\$\{(.*)\}$/, '$1')
      // if var:
      if (unWrappedVarString.match(/^[a-zA-Z0-9._-]+:/)) {
        const type = unWrappedVarString.split(':')[0]
        return fallbackMap[type] || type
      } else if (unWrappedVarString.match(/^[a-zA-Z0-9._-]+\(/)) {
        const type = unWrappedVarString.split('(')[0]
        return fallbackMap[type] || 'function'
      }
    }
    // console.log('getVariableType early return', { varString, hasVariableTypes: !!variableTypes })
    return 'dot.prop'
  }

  for (const variableType of variableTypes) {
    if (!variableType.match) continue

    // Handle both regex and function matchers
    if (typeof variableType.match === 'function') {
      if (variableType.match(varString)) {
        return variableType.type
      }
    } else if (variableType.match.test) {
      // Reset regex lastIndex to ensure clean matching
      variableType.match.lastIndex = 0
      if (variableType.match.test(varString)) {
        return variableType.type
      }
    }
  }

  // Fallback to dot.prop for simple property references
  // console.log('varString no match, fallback to dot.prop:', varString)
  return 'dot.prop'
}

module.exports = { getVariableType }
