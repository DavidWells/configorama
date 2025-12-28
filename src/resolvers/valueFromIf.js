/* ${if(...)} syntax - alias for eval() with more intuitive name for conditionals */
const { resolver: evalResolver } = require('./valueFromEval')

const ifRefSyntax = RegExp(/^if\((.*)?\)/g)

async function getValueFromIf(variableString) {
  // Convert if(...) to eval(...) and reuse the eval resolver
  const converted = variableString.replace(/^if\(/, 'eval(')
  return evalResolver(converted)
}

module.exports = {
  type: 'if',
  source: 'readonly',
  description: '${if(condition ? "yes" : "no")} - Conditional expressions (alias for eval)',
  match: ifRefSyntax,
  resolver: getValueFromIf
}
