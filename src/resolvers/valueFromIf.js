/* ${if(...)} syntax - alias for eval() with more intuitive name for conditionals */
const { resolver: evalResolver } = require('./valueFromEval')

// Match both:
//   if(condition ? trueVal : falseVal)  - ternary inside
//   if(condition) ? trueVal : falseVal  - ternary outside
const ifRefSyntax = RegExp(/^if\s*\(.*\)(\s*\?.*)?/g)

async function getValueFromIf(variableString) {
  if (process.env.DEBUG_IF) console.log('if resolver input:', variableString)

  // Check for external ternary: if(condition) ? trueVal : falseVal
  // Must properly balance parentheses to find where if() ends
  const match = variableString.match(/^if\s*\(/)
  if (match) {
    const afterIf = variableString.substring(match[0].length)
    let depth = 1
    let i = 0

    // Find the matching closing paren
    while (i < afterIf.length && depth > 0) {
      if (afterIf[i] === '(') depth++
      else if (afterIf[i] === ')') depth--
      if (depth > 0) i++
    }

    if (depth === 0) {
      // Check what comes after the if() block
      const afterCondition = afterIf.substring(i + 1).trim()

      if (afterCondition.startsWith('?')) {
        // External ternary: if(condition) ? trueVal : falseVal
        const condition = afterIf.substring(0, i)
        const ternaryPart = afterCondition.substring(1).trim() // after ?

        // Find the colon separating trueVal and falseVal (outside quotes and encoded patterns)
        let colonIdx = -1
        let inQuote = false
        let quoteChar = ''
        for (let j = 0; j < ternaryPart.length; j++) {
          const ch = ternaryPart[j]
          if (!inQuote && (ch === '"' || ch === "'")) {
            inQuote = true
            quoteChar = ch
          } else if (inQuote && ch === quoteChar) {
            inQuote = false
          } else if (!inQuote && ch === ':') {
            // Skip colons inside encoded patterns __OBJ:...__ or __ARR:...__
            const before = ternaryPart.substring(0, j)
            const isEncodedPattern = /__(?:OBJ|ARR|VAL\d+)$/.test(before)
            if (!isEncodedPattern) {
              colonIdx = j
              break
            }
          }
        }

        if (colonIdx !== -1) {
          const trueVal = ternaryPart.substring(0, colonIdx).trim()
          const falseVal = ternaryPart.substring(colonIdx + 1).trim()
          const expression = `(${condition}) ? ${trueVal} : ${falseVal}`
          if (process.env.DEBUG_IF) console.log('if resolver external ternary:', expression)
          return evalResolver(`eval(${expression})`)
        }
      }
    }
  }

  // Standard syntax: if(condition ? trueVal : falseVal) or if(boolExpr)
  const converted = variableString.replace(/^if\s*\(/, 'eval(')
  if (process.env.DEBUG_IF) console.log('if resolver standard syntax:', converted)
  return evalResolver(converted)
}

module.exports = {
  type: 'if',
  source: 'readonly',
  description: '${if(condition) ? "yes" : "no"} - Conditional expressions',
  match: ifRefSyntax,
  resolver: getValueFromIf
}
