// Resolves values from CLI option flags
// Matches ${opt:FLAG_NAME} syntax with optional fallback values
const optRefSyntax = RegExp(/^opt:/g)

function getValueFromOptions(variableString, options) {
  const requestedOption = variableString.split(':')[1]
  const valueToPopulate = options[requestedOption]
  return Promise.resolve(valueToPopulate)
}

module.exports = {
  type: 'options',
  source: 'user',
  prefix: 'opt',
  syntax: '${opt:flagName}',
  description: 'Resolves CLI option flags. Examples: ${opt:stage}, ${opt:other, "fallbackValue"}',
  match: optRefSyntax,
  resolver: getValueFromOptions
}
