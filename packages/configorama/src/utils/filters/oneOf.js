const { splitCsv } = require('../strings/splitCsv')
const { trimSurroundingQuotes } = require('../strings/quoteUtils')
const { isResolvedFilterArg, unwrapFilterArg } = require('./filterArgs')

function isRuntimeContextArg(value) {
  return typeof value === 'string' && value.startsWith('from ')
}

function stripRuntimeContext(args) {
  if (!args.length) return args
  const last = args[args.length - 1]
  return isRuntimeContextArg(last) ? args.slice(0, -1) : args
}

function hasDynamicArgument(value) {
  return typeof value === 'string' && value.includes('${')
}

function parseOneOfLiteral(rawValue) {
  const trimmed = String(rawValue).trim()
  const unquoted = trimSurroundingQuotes(trimmed, false)
  if (unquoted !== trimmed) return unquoted
  if (/^-?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return Number(trimmed)
  return trimmed
}

function parseOneOfFilter(filter) {
  if (typeof filter !== 'string') return null
  const match = filter.match(/^oneOf\(([\s\S]*)\)$/)
  if (!match) return null

  const args = splitCsv(match[1], ',', { protectVariables: true })
    .filter(arg => arg !== '')

  if (args.some(hasDynamicArgument)) {
    return {
      dynamic: true,
      allowedValues: null,
    }
  }

  return {
    dynamic: false,
    allowedValues: args.map(arg => String(parseOneOfLiteral(arg))),
  }
}

function validateOneOf(value, ...rawArgs) {
  const args = stripRuntimeContext(rawArgs)
  if (!args.length) {
    throw new Error('Configorama Error: oneOf() requires at least one allowed value')
  }
  if (args.some(hasDynamicArgument)) {
    throw new Error('Configorama Error: oneOf(${...}) dynamic arguments are not supported yet')
  }

  const hasResolvedFilterArg = args.some(isResolvedFilterArg)
  const unwrappedArgs = args.map(unwrapFilterArg)
  if (hasResolvedFilterArg) {
    if (unwrappedArgs.length !== 1 || !Array.isArray(unwrappedArgs[0])) {
      throw new Error('Configorama Error: oneOf(${...}) must resolve to an array')
    }
  }

  const allowed = hasResolvedFilterArg ? unwrappedArgs[0] : unwrappedArgs
  const allowedValues = allowed.map(String)
  if (!allowedValues.some(allowed => allowed === String(value))) {
    throw new Error(`Configorama Error: Value "${value}" is not oneOf(${allowedValues.join(', ')})`)
  }
  return value
}

module.exports = {
  parseOneOfFilter,
  parseOneOfLiteral,
  validateOneOf,
}
