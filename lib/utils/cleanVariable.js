/**
 * Convert variable into string
 * ${opt:foo} => 'opt:foo'
 * @param match The variable match instance variable part
 * @returns {string} The cleaned variable match
 */

const fileRefSyntax = RegExp(/^file\((~?[a-zA-Z0-9._\-\/,'" ]+?)\)/g)
const funcRegex = /(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
module.exports = function cleanVariable(match, variableSyntax, simple) {
  const clean = match.replace(variableSyntax, (context, contents) => {
    return contents.trim()
  })

  // Support for simple variable cleaning with no space tweaks
  if (simple) {
    return clean
  }

  // Support for function matches that dont need space alterations
  if (!clean.match(fileRefSyntax) && funcRegex.exec(clean)) {
    return clean
  }

  // If file ref, add spaces after commas
  // Special case for file(thing, arg, argTwo)
  if (clean.match(fileRefSyntax)) {
    // replace spaces before and after commas
    return clean.replace(/\s*,\s*/g, ', ')
  }

  return clean.replace(/\s+(?=([^"']*"[^"']*")*[^"']*$)/g, '')
  // ^ trim White Space OutSide Quotes https://regex101.com/r/BuBNPN/1
  // Needed for fallback values with spaces. ${empty, 'fallback value with space'}
}
