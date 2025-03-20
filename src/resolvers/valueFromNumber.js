const isNumber = require('lodash.isnumber')

function isNumberVariable(variableString) {
  const num = Number(variableString)
  return !isNaN(num) && isNumber(num)
}

function getValueFromNumber(variableString) {
  return Promise.resolve(Number(variableString))
}

module.exports = {
  type: 'number',
  match: isNumberVariable,
  resolver: getValueFromNumber
}
