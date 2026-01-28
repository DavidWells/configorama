// Resolves numeric literal variables to their Number values
const { isNumber } = require('../utils/lodash')

/**
 * @param {string} variableString
 * @returns {boolean}
 */
function isNumberVariable(variableString) {
  if (!variableString || variableString.trim().length === 0) {
    return false
  }
  const num = Number(variableString)
  return !isNaN(num) && isNumber(num)
}

/**
 * @param {string} variableString
 * @returns {Promise<number>}
 */
function getValueFromNumber(variableString) {
  return Promise.resolve(Number(variableString))
}

module.exports = {
  type: 'number',
  internal: true,
  match: isNumberVariable,
  resolver: getValueFromNumber
}
