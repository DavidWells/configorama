/**
 * Preprocesses config to fix malformed fallback references,
 * escape variables inside help() filter arguments,
 * and convert bare references in if() expressions
 */
const { splitByComma } = require('../strings/splitByComma')
const { getQuoteRanges } = require('../strings/quoteAware')
const { extractVariableWrapper } = require('../variables/variableUtils')

/**
 * Preprocess config to fix malformed fallback references
 * @param {Object} configObject - The parsed configuration object
 * @param {RegExp} variableSyntax - The variable syntax regex to use
 * @param {Array} [variableTypes] - Array of variable type definitions with type/prefix fields
 * @param {Object} [options] - Options for preprocessing
 * @param {boolean} [options.skipFallbackFix] - Skip fixing malformed fallbacks (for object configs)
 * @returns {Object} The preprocessed configuration object
 */
function preProcess(configObject, variableSyntax, variableTypes, options = {}) {
  const { skipFallbackFix = false } = options
  // Extract prefix/suffix from variable syntax for reconstructing variables
  const { prefix: varPrefix, suffix: varSuffix } = variableSyntax
    ? extractVariableWrapper(variableSyntax.source)
    : { prefix: '${', suffix: '}' }

  // Extract reference prefixes from variable types, or use defaults
  const refPrefixes = variableTypes && variableTypes.length > 0
    ? variableTypes
        .map(v => (v.prefix || v.type) + ':')
        .filter(p => p !== 'dot.prop:' && p !== 'string:' && p !== 'number:')
    : ['self:', 'opt:', 'env:', 'file:', 'text:', 'deep:']

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
   * Convert bare config references inside if() expressions to ${...} syntax
   * Also wraps unquoted ${...} refs in quotes for proper string comparison
   * e.g., ${if(provider.stage === "prod")} => ${if("${provider.stage}" === "prod")}
   * e.g., ${if(${provider.stage} === "prod")} => ${if("${provider.stage}" === "prod")}
   * @param {string} str - String potentially containing if() expressions
   * @returns {string} String with bare refs converted
   */
  function convertBareRefsInIf(str) {
    if (typeof str !== 'string') return str

    const reserved = ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']
    const prefixLen = varPrefix.length
    const suffixLen = varSuffix.length

    // Find if( blocks and process them
    let result = str
    let i = 0

    while (i < result.length) {
      // Look for ${if( or similar with custom prefix
      const ifStart = result.indexOf(varPrefix + 'if(', i)
      if (ifStart === -1) break

      // Find the matching closing suffix by counting nested prefixes/suffixes
      const contentStart = ifStart + prefixLen + 3 // after "${if("
      let depth = 1
      let j = contentStart

      while (j < result.length && depth > 0) {
        if (result.substring(j, j + prefixLen) === varPrefix) {
          depth++
          j += prefixLen
        } else if (result.substring(j, j + suffixLen) === varSuffix) {
          depth--
          if (depth > 0) j += suffixLen
        } else {
          j++
        }
      }

      if (depth === 0) {
        // Extract the if content (everything between "if(" and the final ")")
        const fullContent = result.substring(contentStart, j)

        // Process the content: wrap bare refs and unquoted var refs in quotes
        let processed = fullContent

        // 1. First convert bare refs (word.word or word:word) to quoted var refs
        // Must do this BEFORE handling ${...} to avoid double-wrapping
        // Pattern excludes refs inside ${...} by using negative lookbehind for varPrefix
        const escapedPrefix = varPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const bareRefPattern = new RegExp(
          `(?<!${escapedPrefix}[^${varSuffix}]*)(?<!")(?<!')(?<=^|[^.\\w])([a-zA-Z_][a-zA-Z0-9_]*(?:[.:][a-zA-Z_][a-zA-Z0-9_]*)+)(?![.\\w])`,
          'g'
        )

        // Simpler approach: find bare refs that are NOT inside ${...}
        // Build list of ${...} ranges to exclude
        const varRanges = []
        let pos = 0
        while (pos < processed.length) {
          if (processed.substring(pos, pos + prefixLen) === varPrefix) {
            const start = pos
            let varDepth = 1
            pos += prefixLen
            while (pos < processed.length && varDepth > 0) {
              if (processed.substring(pos, pos + prefixLen) === varPrefix) {
                varDepth++
                pos += prefixLen
              } else if (processed.substring(pos, pos + suffixLen) === varSuffix) {
                varDepth--
                if (varDepth > 0) pos += suffixLen
              } else {
                pos++
              }
            }
            pos += suffixLen
            varRanges.push([start, pos])
          } else {
            pos++
          }
        }

        // Build list of quoted string ranges to exclude
        const quoteRanges = getQuoteRanges(fullContent)

        // Comparison operators for detecting string comparison context
        const comparisonOps = ['===', '!==', '==', '!=']

        // Find and replace bare refs, skipping those inside ${...} or quoted strings
        // Only quote bare refs that are in string comparison context
        const simpleBarePat = /([a-zA-Z_][a-zA-Z0-9_]*(?:[.:][a-zA-Z_][a-zA-Z0-9_]*)+)/g
        let offset = 0
        let match
        while ((match = simpleBarePat.exec(fullContent)) !== null) {
          const bareRef = match[1]
          const matchStart = match.index
          const matchEnd = matchStart + bareRef.length

          // Skip if inside a ${...} range
          const insideVar = varRanges.some(([s, e]) => matchStart >= s && matchEnd <= e)
          if (insideVar) continue

          // Skip if inside a quoted string
          const insideQuote = quoteRanges.some(([s, e]) => matchStart >= s && matchEnd <= e)
          if (insideQuote) continue

          // Skip reserved words
          if (reserved.includes(bareRef)) continue

          // Check if this ref is in a string comparison context
          const afterRef = fullContent.substring(matchEnd).trimStart()
          const beforeRef = fullContent.substring(0, matchStart).trimEnd()

          const isComparedToString = comparisonOps.some(op => {
            // Check if followed by: op "string"
            if (afterRef.startsWith(op)) {
              const afterOp = afterRef.substring(op.length).trimStart()
              return afterOp.startsWith('"') || afterOp.startsWith("'")
            }
            // Check if preceded by: "string" op
            for (const o of comparisonOps) {
              const pattern = new RegExp(`["'][^"']*["']\\s*${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
              if (pattern.test(beforeRef)) return true
            }
            return false
          })

          // Replace with var ref - quoted if string comparison, unquoted otherwise
          const replacement = isComparedToString
            ? `"${varPrefix}${bareRef}${varSuffix}"`
            : `${varPrefix}${bareRef}${varSuffix}`
          processed = processed.substring(0, matchStart + offset) + replacement + processed.substring(matchEnd + offset)
          offset += replacement.length - bareRef.length
        }

        // 2. Quote unquoted ${...} refs that are used in string comparisons
        // Pattern: ref followed by comparison operator and string, or string followed by operator and ref
        // e.g., ${foo} === "bar" or "bar" === ${foo}
        // Find ${...} refs that are in comparison context
        pos = 0
        let newProcessed = ''
        while (pos < processed.length) {
          if (processed.substring(pos, pos + prefixLen) === varPrefix) {
            const precededByQuote = pos > 0 && processed[pos - 1] === '"'

            // Find matching suffix
            let varDepth = 1
            let endPos = pos + prefixLen
            while (endPos < processed.length && varDepth > 0) {
              if (processed.substring(endPos, endPos + prefixLen) === varPrefix) {
                varDepth++
                endPos += prefixLen
              } else if (processed.substring(endPos, endPos + suffixLen) === varSuffix) {
                varDepth--
                if (varDepth > 0) endPos += suffixLen
              } else {
                endPos++
              }
            }
            endPos += suffixLen

            const varRef = processed.substring(pos, endPos)
            const followedByQuote = endPos < processed.length && processed[endPos] === '"'

            // Check if this ref is in a string comparison context
            const afterRef = processed.substring(endPos).trimStart()
            const beforeRef = processed.substring(0, pos).trimEnd()

            const isComparedToString = comparisonOps.some(op => {
              // Check if followed by: op "string"
              if (afterRef.startsWith(op)) {
                const afterOp = afterRef.substring(op.length).trimStart()
                return afterOp.startsWith('"') || afterOp.startsWith("'")
              }
              // Check if preceded by: "string" op
              for (const o of comparisonOps) {
                const pattern = new RegExp(`["'][^"']*["']\\s*${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
                if (pattern.test(beforeRef)) return true
              }
              return false
            })

            if (!precededByQuote && !followedByQuote && isComparedToString) {
              newProcessed += '"' + varRef + '"'
            } else {
              newProcessed += varRef
            }
            pos = endPos
          } else {
            newProcessed += processed[pos]
            pos++
          }
        }
        processed = newProcessed

        // Reconstruct
        result = result.substring(0, contentStart) + processed + result.substring(j)
        i = contentStart + processed.length + suffixLen
      } else {
        i = ifStart + prefixLen
      }
    }

    return result
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
    const prefixLen = varPrefix.length
    const suffixLen = varSuffix.length

    while (changed) {
      changed = false

      // Find innermost variable blocks (ones that don't contain other variables)
      let i = 0
      while (i < result.length) {
        if (result.substring(i, i + prefixLen) === varPrefix) {
          const start = i
          let depth = 1
          let j = i + prefixLen

          // Find the matching suffix by counting full prefix/suffix occurrences
          while (j < result.length && depth > 0) {
            if (result.substring(j, j + prefixLen) === varPrefix) {
              depth++
              j += prefixLen
            } else if (result.substring(j, j + suffixLen) === varSuffix) {
              depth--
              if (depth > 0) j += suffixLen
            } else {
              j++
            }
          }

          if (depth === 0) {
            const end = j + suffixLen
            const match = result.substring(start, end)
            const content = result.substring(start + prefixLen, end - suffixLen)

            // Only process if there's a comma (indicating fallback syntax)
            if (content.includes(',')) {
              // Split by comma
              const parts = splitByComma(content, variableSyntax)

              if (parts.length > 1) {
                // Check if the first part has nested variables - if so, skip this (process inner ones first)
                const firstPart = parts[0]
                if (firstPart.includes(varPrefix)) {
                  i = start + prefixLen // Move past prefix to find inner variables
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
                  const alreadyWrapped = trimmed.startsWith(varPrefix) && trimmed.endsWith(varSuffix)

                  if (looksLikeRef && !alreadyWrapped) {
                    return ` ${varPrefix}${trimmed}${varSuffix}`
                  }

                  return ` ${trimmed}`
                })

                const replacement = `${varPrefix}${fixed.join(',')}${varSuffix}`
                if (replacement !== match) {
                  result = result.substring(0, start) + replacement + result.substring(end)
                  changed = true
                  break // Restart search from beginning
                }
              }
            }

            i = start + prefixLen // Move past prefix to continue searching for nested variables
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
      // First escape help() variables, convert bare refs in if(), then fix fallbacks
      const withHelpEscaped = escapeHelpVariables(obj)
      const withBareRefsConverted = convertBareRefsInIf(withHelpEscaped)
      // Skip fallback fixing for object configs (they handle bare refs differently)
      return skipFallbackFix ? withBareRefsConverted : fixFallbacksInString(withBareRefsConverted)
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
