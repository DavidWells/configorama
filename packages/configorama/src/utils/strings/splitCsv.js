const { splitByComma } = require('./splitByComma')
const { splitTopLevel } = require('../expressions/scan')
function splitCsv(str, splitter, options = {}) {
  if (splitter && splitter !== ',') return splitTopLevel(str, splitter, {protectVariables:!!options.protectVariables,protectBraces:!!options.protectVariables,preserveDoublePipe:false}).map(s=>s.trim())
  return splitByComma(str, options.protectVariables ? /\$\{[^}]+}/g : undefined)
}
module.exports = { splitCsv }
