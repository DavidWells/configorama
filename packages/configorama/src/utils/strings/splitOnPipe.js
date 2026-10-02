const { splitTopLevel } = require('../expressions/scan')
function splitOnPipe(str) { return splitTopLevel(str, '|', {protectVariables:false,protectBraces:false}) }
function splitOnTopLevelPipe(str, prefix, suffix) { return splitTopLevel(str, '|', {prefix,suffix}) }
module.exports = { splitOnPipe, splitOnTopLevelPipe }
