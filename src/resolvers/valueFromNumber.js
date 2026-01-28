const { isNumber } = require('../utils/lodash')

function isNumberVariable(variableString) {
  if (!variableString || variableString.trim().length === 0) {
    return false
  }
  const num = Number(variableString)
  return !isNaN(num) && isNumber(num)
}

function getValueFromNumber(variableString) {
  return Promise.resolve(Number(variableString))
}

module.exports = {
  type: 'number',
  internal: true,
  match: isNumberVariable,
  resolver: getValueFromNumber
}
