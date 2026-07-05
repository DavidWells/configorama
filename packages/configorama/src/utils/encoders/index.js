const { decodeJsSyntax, hasParenthesesPlaceholder } = require('./js-fixes')
const { decodeUnknown, hasEncodedUnknown } = require('./unknown-values')

// Generic decoder for all encoded values
function decodeEncodedValue(value) {
  if (hasParenthesesPlaceholder(value)) {
    return decodeJsSyntax(value)
  }
  if (hasEncodedUnknown(value)) {
    return decodeUnknown(value)
  }
  return value
}

module.exports = { decodeEncodedValue }