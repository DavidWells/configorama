/**
 * Convert variable into string
 * ${opt:foo} => 'opt:foo'
 * @param match The variable match instance variable part
 * @returns {string} The cleaned variable match
 */
module.exports = function cleanVariable(match, variableSyntax) {
  return match.replace(variableSyntax, (context, contents) => {
    return contents.trim()
  }).replace(/\s/g, '')
}
