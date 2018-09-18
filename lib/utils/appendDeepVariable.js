
module.exports = function appendDeepVariable(variable, subProperty) {
  return `${variable.slice(0, variable.length - 1)}.${subProperty}}`
}
