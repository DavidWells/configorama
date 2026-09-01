const { trim } = require('../lodash')
const { trimSurroundingQuotes } = require('./quoteUtils')
const { decodeFilterArg, isEncodedFilterArg } = require('../filters/filterArgs')

function formatArg(arg) {
  const trimmed = trim(arg)
  if (isEncodedFilterArg(trimmed)) {
    return decodeFilterArg(trimmed)
  }
  const cleanArg = trimSurroundingQuotes(trimmed, false)
  // An arg that looks like a JSON object/array is parsed as one, so filters can take structured args.
  // If it only looks like JSON but isn't valid (e.g. `[, ]`, or a bare literal that happens to hold
  // brackets), fall back to the plain string rather than leaking a raw JSON.parse error to the user.
  if (cleanArg.match(/^{([^}]+)}$/) || cleanArg.match(/^\[([^}]+)\]$/) || cleanArg.match(/^{(.*)}$/)) {
    try {
      return JSON.parse(cleanArg)
    } catch (err) {
      return cleanArg
    }
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
