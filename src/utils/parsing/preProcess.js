/**
 * Preprocesses config to fix malformed fallback references
 * and escape variables inside help() filter arguments
 */
const { splitByComma } = require('../strings/splitByComma')

/**
 * Preprocess config to fix malformed fallback references
 * @param {Object} configObject - The parsed configuration object
 * @param {RegExp} variableSyntax - The variable syntax regex to use
 * @returns {Object} The preprocessed configuration object
 */
function preProcess(configObject, variableSyntax) {
  // Known reference prefixes that should be wrapped in ${}
  const refPrefixes = ['self:', 'opt:', 'env:', 'file:', 'text:', 'deep:']

  /**
   * Escape variables inside help() filter arguments so main resolver skips them
   * Uses base64 encoding to preserve exact original syntax (supports custom variable syntax)
   * @param {string} str - String potentially containing help() with variables
   * @returns {string} String with help() variables escaped
   */
  function escapeHelpVariables(str) {
    if (typeof str !== 'string') return str
    if (!variableSyntax) return str

    // Match help('...') or help("...") containing variables
    const helpPattern = /help\(['"]([^'"]+)['"]\)/g

    return str.replace(helpPattern, (match, helpContent) => {
      // Check if help content contains variables
      if (!helpContent.match(variableSyntax)) return match

      // Replace each variable match with base64-encoded placeholder
      const escaped = helpContent.replace(variableSyntax, (varMatch) => {
        const encoded = Buffer.from(varMatch).toString('base64')
        return `__CONFIGVAR:${encoded}__`
      })
      return `help('${escaped}')`
    })
  }

  /**
   * Fix malformed fallback references in a string
   * @param {string} str - String potentially containing variables
   * @returns {string} String with fixed fallback references
   */
  function fixFallbacksInString(str) {
    if (typeof str !== 'string') return str

    let result = str
    let changed = true

    // Keep iterating until no more changes (to handle nested variables)
    while (changed) {
      changed = false

      // Find innermost ${...} blocks (ones that don't contain other ${)
      let i = 0
      while (i < result.length) {
        if (result[i] === '$' && result[i + 1] === '{') {
          const start = i
          let braceCount = 1
          let j = i + 2

          // Find the matching closing brace by counting { and }
          while (j < result.length && braceCount > 0) {
            if (result[j] === '{') {
              braceCount++
            } else if (result[j] === '}') {
              braceCount--
            }
            j++
          }

          if (braceCount === 0) {
            const end = j
            const match = result.substring(start, end)
            const content = result.substring(start + 2, end - 1)

            // Only process if there's a comma (indicating fallback syntax)
            if (content.includes(',')) {
              // Split by comma
              const parts = splitByComma(content, variableSyntax)

              if (parts.length > 1) {
                // Check if the first part has nested ${} - if so, skip this (process inner ones first)
                const firstPart = parts[0]
                if (firstPart.includes('${')) {
                  i = start + 2 // Move past ${ to find inner variables
                  continue
                }

                // Check each part after the first (these are fallback values)
                const fixed = parts.map((part, index) => {
                  if (index === 0) {
                    return part // Keep the main reference as-is
                  }

                  const trimmed = part.trim()

                  // Check if this looks like a reference but is not wrapped
                  const looksLikeRef = refPrefixes.some(prefix => trimmed.startsWith(prefix))
                  const alreadyWrapped = trimmed.startsWith('${') && trimmed.endsWith('}')

                  if (looksLikeRef && !alreadyWrapped) {
                    return ` \${${trimmed}}`
                  }

                  return ` ${trimmed}`
                })

                const replacement = `\${${fixed.join(',')}}`
                if (replacement !== match) {
                  result = result.substring(0, start) + replacement + result.substring(end)
                  changed = true
                  break // Restart search from beginning
                }
              }
            }

            i = start + 2 // Move past ${ to continue searching for nested variables
          } else {
            i++
          }
        } else {
          i++
        }
      }
    }

    return result
  }

  /**
   * Recursively traverse and fix the config object
   */
  function traverseAndFix(obj) {
    if (typeof obj === 'string') {
      // First escape help() variables, then fix fallbacks
      const withHelpEscaped = escapeHelpVariables(obj)
      return fixFallbacksInString(withHelpEscaped)
    }

    if (Array.isArray(obj)) {
      return obj.map(item => traverseAndFix(item))
    }

    if (obj !== null && typeof obj === 'object') {
      const result = {}
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          result[key] = traverseAndFix(obj[key])
        }
      }
      return result
    }

    return obj
  }

  return traverseAndFix(configObject)
}

module.exports = preProcess
