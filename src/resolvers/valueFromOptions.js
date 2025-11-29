
const optRefSyntax = RegExp(/^opt:/g)

function getValueFromOptions(variableString, options) {
  const requestedOption = variableString.split(':')[1]
  let valueToPopulate
  if (requestedOption !== '' || '' in options) {
    valueToPopulate = options[requestedOption]
  } else {
    valueToPopulate = options
  }
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
