
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
  match: optRefSyntax,
  resolver: getValueFromOptions
}
