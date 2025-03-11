module.exports = function trimQuotes(str = '') {
  return str
    .replace(/^(")([^"\n]*?)(\1)$/, "$2")
    .replace(/^(')([^'\n]*?)(\1)$/, "$2")
}