const PAREN_OPEN_PLACEHOLDER = '__PH_PAREN_OPEN__'
const OPEN_PAREN_PLACEHOLDER_PATTERN = /__PH_PAREN_OPEN__/g

function encodeJsSyntax(value = '') {
  return value.replace(/\(/g, PAREN_OPEN_PLACEHOLDER)
}

function decodeJsSyntax(value) {
  if (!value) return value
  return value.replace(OPEN_PAREN_PLACEHOLDER_PATTERN, '(')
}

function hasParenthesesPlaceholder(value = '') {
  return OPEN_PAREN_PLACEHOLDER_PATTERN.test(value)
}

module.exports = {
  OPEN_PAREN_PLACEHOLDER_PATTERN,
  hasParenthesesPlaceholder,
  encodeJsSyntax,
  decodeJsSyntax,
}