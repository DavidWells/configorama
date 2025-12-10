const { trim } = require('../lodash')
const { trimSurroundingQuotes } = require('./quoteUtils')

function formatArg(arg) {
  const cleanArg = trimSurroundingQuotes(trim(arg), false)
  if (cleanArg.match(/^{([^}]+)}$/)) {
    return JSON.parse(cleanArg)
  }
  if (cleanArg.match(/^\[([^}]+)\]$/)) {
    return JSON.parse(cleanArg)
  }
  if (cleanArg.match(/^{(.*)}$/)) {
    return JSON.parse(cleanArg)
  }
  return cleanArg
}

module.exports = function formatArgs(args) {
  if (typeof args === 'string') {
    return formatArg(args)
  }
  return args.map((arg) => {
    // Skip formatting for non-string args (e.g., arrays/objects from nested function calls)
    if (typeof arg !== 'string') {
      return arg
    }
    return formatArg(arg)
  })
}
