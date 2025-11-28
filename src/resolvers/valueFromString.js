const trimSurroundingQuotes = require('../utils/trimSurroundingQuotes')

const stringRefSyntax = RegExp(/(?:('|").*?\1)/g)

function getValueFromString(variableString) {
  const valueToPopulate = trimSurroundingQuotes(variableString, false)
  return Promise.resolve(valueToPopulate)
}

module.exports = {
  type: 'string',
  internal: true,
  match: stringRefSyntax,
  resolver: getValueFromString
}
