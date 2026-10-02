const { splitTopLevel } = require('../expressions/scan')
const { extractVariableWrapper } = require('../variables/variableUtils')
function splitByComma(string, regexPattern) {
  if (!string || !string.trim()) return ['']
  const wrapper = regexPattern ? extractVariableWrapper(regexPattern.source) : {}
  return splitTopLevel(string, ',', { ...wrapper, protectVariables:!!regexPattern, protectBraces:!!regexPattern }).map(s=>s.trim())
}
module.exports = { splitByComma }
