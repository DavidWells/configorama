
const stringRefSyntax = RegExp(/(?:('|").*?\1)/g)

function getValueFromString(variableString) {
  const valueToPopulate = variableString.replace(/^['"]|['"]$/g, '')
  return Promise.resolve(valueToPopulate)
}

module.exports = {
  type: 'string',
  match: stringRefSyntax,
  resolver: getValueFromString
}
