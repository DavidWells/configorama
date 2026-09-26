const { trimSurroundingQuotes } = require('../utils/strings/quoteUtils')
const { decodeLiteralBraces } = require('../utils/encoders/literal-braces')

const stringRefSyntax = RegExp(/(?:('|").*?\1)/g)

function getValueFromString(variableString) {
  // A quoted literal's { } $ were encoded while it sat inside the variable expression
  const valueToPopulate = decodeLiteralBraces(trimSurroundingQuotes(variableString, false))
  return Promise.resolve(valueToPopulate)
}

module.exports = {
  type: 'string',
  internal: true,
  match: stringRefSyntax,
  resolver: getValueFromString
}
