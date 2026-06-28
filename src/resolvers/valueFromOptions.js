// Resolves values from CLI option flags
// Matches ${opt:FLAG_NAME} and ${option:FLAG_NAME} syntax with optional fallback values
const optRefSyntax = RegExp(/^(?:opt|option):/g)

function getValueFromOptions(variableString, options) {
  const requestedOption = variableString.split(':')[1]
  const valueToPopulate = options[requestedOption]
  return Promise.resolve(valueToPopulate)
}

module.exports = {
  type: 'options',
  source: 'user',
  prefix: 'opt',
  prefixes: ['opt', 'option'],
  syntax: '${option:flagName}',
  description: 'Resolves CLI option flags. Examples: ${option:stage}, ${opt:stage}, ${option:other, "fallbackValue"}',
  match: optRefSyntax,
  resolver: getValueFromOptions
}
