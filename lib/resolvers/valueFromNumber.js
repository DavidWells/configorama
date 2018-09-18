const _ = require('lodash')

function isNumberVariable(variableString) {
  const num = Number(variableString)
  return !isNaN(num) && _.isNumber(num)
}

function getValueFromNumber(variableString) {
  return Promise.resolve(Number(variableString))
}

module.exports = {
  match: isNumberVariable,
  resolver: getValueFromNumber
}
