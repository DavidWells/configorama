// const evalRefSyntax = RegExp(/^eval\((~?[\{\}\:\${}a-zA=>+!-Z0-9._\-\/,'"\*\` ]+?)?\)/g)
const evalRefSyntax = RegExp(/^eval\((.*)?\)/g)
const { replaceOutsideQuotes } = require('../utils/strings/quoteAware')

// Pattern for encoded objects/arrays: __OBJ:base64__ or __ARR:base64__
const ENCODED_PATTERN = /__(?:OBJ|ARR):([A-Za-z0-9+/=]+)__/g

// Encode object/array for embedding in eval expressions
function encodeValue(value) {
  const prefix = Array.isArray(value) ? 'ARR' : 'OBJ'
  const encoded = Buffer.from(JSON.stringify(value)).toString('base64')
  return `__${prefix}:${encoded}__`
}

// Decode encoded values and build context for subscript
function decodeValues(expression) {
  const context = {}
  let idx = 0

  const processed = expression.replace(ENCODED_PATTERN, (match, base64) => {
    const decoded = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
    const placeholder = `__VAL${idx}__`
    context[`__VAL${idx}__`] = decoded
    idx++
    return placeholder
  })

  return { processed, context }
}

// Wrap individual comparisons in parentheses for correct precedence with && / ||
// Subscript has operator precedence issues without explicit parens
function wrapComparisons(expr) {
  if (!/&&|\|\|/.test(expr)) return expr

  // Match comparisons: value op value (where op is ===, !==, ==, !=, >=, <=, >, <)
  // Values can be: quoted strings, numbers, identifiers, or __VAL0__ placeholders
  const compPattern = /((?:"[^"]*"|'[^']*'|__VAL\d+__|__NULL__|[a-zA-Z_][a-zA-Z0-9_]*|[\d.]+))\s*(===|!==|==|!=|>=|<=|>|<)\s*((?:"[^"]*"|'[^']*'|__VAL\d+__|__NULL__|[a-zA-Z_][a-zA-Z0-9_]*|[\d.]+))/g

  return expr.replace(compPattern, '($1 $2 $3)')
}

async function getValueFromEval(variableString) {
  // Extract the expression inside eval()
  const match = variableString.match(/^eval\((.+)\)$/)
  if (!match) {
    throw new Error(`Invalid eval syntax: ${variableString}. Expected format: eval(expression)`)
  }

  const expression = match[1].trim()
  if (process.env.DEBUG_EVAL) console.log('eval expression:', expression)

  // Use "justin" variant to support strict comparison (===, !==) and other JS-like operators
  try {
    const { default: subscript } = await import('subscript/justin')

    // Handle string comparisons by ensuring both sides are quoted
    let processedExpression = expression.replace(/([a-zA-Z0-9_]+)\s*([=!<>]=?)\s*['"]([^'"]+)['"]/g, '"$1"$2"$3"')

    // Decode any encoded objects/arrays
    const { processed: withDecodedValues, context: valueContext } = decodeValues(processedExpression)
    processedExpression = withDecodedValues

    // Workaround: subscript doesn't handle null keyword correctly
    // Replace null with placeholder and inject via context (but not inside quoted strings)
    const hasNull = /\bnull\b/.test(processedExpression)
    if (hasNull) {
      processedExpression = replaceOutsideQuotes(processedExpression, 'null', '__NULL__')
    }

    // Build context with null and any decoded values
    /** @type {Record<string, unknown>} */
    const context = { ...valueContext }
    if (hasNull) {
      context.__NULL__ = null
    }

    // Wrap comparisons in parens for correct precedence with && / ||
    processedExpression = wrapComparisons(processedExpression)

    if (process.env.DEBUG_EVAL) console.log('eval processed:', processedExpression)
    const fn = subscript(processedExpression)
    const result = fn(Object.keys(context).length > 0 ? context : undefined)
    return result
  } catch (error) {
    throw new Error(`Error evaluating expression "${expression}": ${error.message}`)
  }
}

module.exports = {
  type: 'eval',
  source: 'readonly',
  encodeValue,
  description: '${eval(expression)} - Evaluates mathematical expressions',
  match: evalRefSyntax,
  resolver: getValueFromEval
}