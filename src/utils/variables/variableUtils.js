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
  getFallbackString,
  verifyVariable
} 