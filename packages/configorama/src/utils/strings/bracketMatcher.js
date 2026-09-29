/**
 * Finds all outermost matching brace pairs in a string
 * @param {string} text - The text to search
 * @param {string} openChar - The opening character (default: '{')
 * @param {string} closeChar - The closing character (default: '}')
 * @param {string} prefix - Optional prefix before opening char (e.g., '$' for '${')
 * @returns {Array<string>} Array of matched substrings including delimiters
 */
function findOutermostBraces(text, openChar = '{', closeChar = '}', prefix = '') {
  const matches = []
  let i = 0
  const openPattern = prefix + openChar

  while (i < text.length) {
    // Check if we have a match at this position
    const checkLen = openPattern.length
    if (text.substring(i, i + checkLen) === openPattern) {
      let depth = 1
      let start = i
      i += checkLen

      while (i < text.length && depth > 0) {
        if (text[i] === openChar) {
          depth++
        } else if (text[i] === closeChar) {
          depth--
        }
        i++
      }

      if (depth === 0) {
        matches.push(text.substring(start, i))
      }
    } else {
      i++
    }
  }

  return matches
}

/**
 * Finds the [start, end) index range of every outermost matching brace pair
 * @param {string} text - The text to search
 * @param {string} openChar - The opening character
 * @param {string} closeChar - The closing character
 * @returns {Array<[number, number]>} Ranges; text.slice(start, end) includes delimiters
 */
function findOutermostBraceRanges(text, openChar = '{', closeChar = '}') {
  /** @type {Array<[number, number]>} */
  const ranges = []
  let depth = 0
  let startIndex = -1

  for (let i = 0; i < text.length; i++) {
    if (text[i] === openChar) {
      if (depth === 0) {
        startIndex = i
      }
      depth++
    } else if (text[i] === closeChar) {
      depth--
      if (depth === 0 && startIndex !== -1) {
        ranges.push([startIndex, i + 1])
        startIndex = -1
      }
    }
  }

  return ranges
}

/**
 * Alternative implementation for finding outermost braces using depth tracking
 * Optimized for simple bracket matching without prefix
 * @param {string} text - The text to search
 * @param {string} openChar - The opening character
 * @param {string} closeChar - The closing character
 * @returns {Array<string>} Array of matched substrings including delimiters
 */
function findOutermostBracesDepthFirst(text, openChar = '{', closeChar = '}') {
  return findOutermostBraceRanges(text, openChar, closeChar).map(([start, end]) => text.substring(start, end))
}

/**
 * Finds outermost variables with ${} syntax
 * @param {string} text - The text to search
 * @returns {Array<string>} Array of matched variables including ${}
 */
function findOutermostVariables(text) {
  return findOutermostBraces(text, '{', '}', '$')
}

/**
 * Find the outermost variable in text that contains the given variable occurrence.
 * A nested variable's fallback lives in its enclosing variable, never in literal text
 * outside every variable.
 * @param {string} text - The text containing the variable
 * @param {string} variable - The variable to locate (including prefix/suffix)
 * @param {string} prefix - Variable syntax prefix (e.g. '${')
 * @param {string} suffix - Variable syntax suffix (e.g. '}' or '}}')
 * @param {number} [index] - Index of the occurrence in text. The same variable can sit
 *   in different enclosing variables (${a, ${x}, 'fb'} ${x}); without an index the
 *   first occurrence is used.
 * @returns {string|null} The enclosing outermost variable, or null if not determinable
 */
function findEnclosingVariable(text, variable, prefix, suffix, index) {
  if (!prefix || !suffix) return null
  if (suffix.length !== 1) return findEnclosingMultiChar(text, variable, prefix, suffix, index)
  const outermost = findOutermostBraces(text, prefix.slice(-1), suffix, prefix.slice(0, -1))
  if (typeof index !== 'number') {
    const enclosing = outermost.find((match) => match.indexOf(variable) > -1)
    return enclosing || null
  }
  if (text.slice(index, index + variable.length) !== variable) return null
  // Outermost matches are ordered and non-overlapping, so each starts at the first
  // occurrence of its text after the previous match ends.
  let cursor = 0
  for (const match of outermost) {
    const start = text.indexOf(match, cursor)
    cursor = start + match.length
    if (start <= index && index + variable.length <= cursor) return match
  }
  return null
}

/**
 * Every variable span in text, for any prefix and suffix ({{ }}, ${{ }}): matched by a stack,
 * innermost first
 * @param {string} text
 * @param {string} prefix
 * @param {string} suffix
 * @returns {Array<{ start: number, end: number }>} Spans; text.slice(start, end) is the variable
 */
function variableSpans(text, prefix, suffix) {
  /** @type {number[]} */
  const opens = []
  /** @type {Array<{ start: number, end: number }>} */
  const spans = []
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith(prefix, i)) {
      opens.push(i)
      i += prefix.length - 1
    } else if (opens.length && text.startsWith(suffix, i)) {
      spans.push({ start: /** @type {number} */ (opens.pop()), end: i + suffix.length })
      i += suffix.length - 1
    }
  }
  return spans
}

/**
 * findEnclosingVariable for a multi-char suffix: the outermost span around the occurrence
 * @param {string} text
 * @param {string} variable
 * @param {string} prefix
 * @param {string} suffix
 * @param {number} [index]
 * @returns {string|null}
 */
function findEnclosingMultiChar(text, variable, prefix, suffix, index) {
  const at = typeof index === 'number' ? index : text.indexOf(variable)
  if (at < 0 || text.slice(at, at + variable.length) !== variable) return null
  let best = null
  for (const span of variableSpans(text, prefix, suffix)) {
    if (span.start <= at && at + variable.length <= span.end && (!best || span.end - span.start > best.end - best.start)) best = span
  }
  return best ? text.slice(best.start, best.end) : null
}

/**
 * Find the innermost variable around the occurrence of `variable` at `index`: its direct
 * parent, e.g. `${env:C, ${env:D}}` for `${env:D}` in `${env:A, ${env:C, ${env:D}}}`,
 * where findEnclosingVariable gives the outermost one.
 * @param {string} text - The text containing the variable
 * @param {string} variable - The variable occurrence (including prefix/suffix)
 * @param {string} prefix - Variable syntax prefix (e.g. '${')
 * @param {string} suffix - Variable syntax suffix; must be one character
 * @param {number} index - Index of the occurrence in text
 * @returns {{ start: number, text: string }|null} The parent variable and where it starts, or null
 */
function findParentVariable(text, variable, prefix, suffix, index) {
  if (!prefix || !suffix) return null
  if (text.slice(index, index + variable.length) !== variable) return null
  const end = index + variable.length
  // Spans close innermost first, so the first one around the occurrence is its parent
  const parent = variableSpans(text, prefix, suffix).find((span) => span.start < index && span.end >= end)
  return parent ? { start: parent.start, text: text.slice(parent.start, parent.end) } : null
}

/**
 * Whether `variable` sits in a fallback slot of the `enclosing` variable expression:
 * after a top-level comma of a plain variable (${env:X, ${self:y}}), not inside a
 * function call's arguments (${merge('a', ${self:y})}), where commas separate arguments.
 * @param {string} enclosing - Enclosing variable text, e.g. '${env:X, ${self:y}}'
 * @param {string} variable - The nested variable text, e.g. '${self:y}'
 * @param {string} prefix - Variable prefix
 * @param {string} suffix - Variable suffix
 * @returns {boolean}
 */
function isFallbackSlot(enclosing, variable, prefix, suffix) {
  if (!enclosing || !enclosing.startsWith(prefix) || !enclosing.endsWith(suffix)) return false
  const inner = enclosing.slice(prefix.length, enclosing.length - suffix.length)
  if (/^\s*[A-Za-z_][\w.]*\s*\(/.test(inner)) return false
  const at = inner.indexOf(variable)
  if (at <= 0) return false
  const before = inner.slice(0, at)
  let depth = 0
  let quote = ''
  for (const ch of before) {
    if (quote) { if (ch === quote) quote = ''; continue }
    if (ch === "'" || ch === '"') quote = ch
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
  }
  return depth === 0 && !quote && before.trimEnd().endsWith(',')
}

/**
 * Whether `variable` sits in the source path of `parent`, its first item: the key in
 * ${self:map.${opt:k}} or ${file(./x.json):${opt:k}}, not a fallback (${a, ${b}}), a filter
 * (${a | f(${b})}), a function argument or a file()/text() path argument.
 * @param {string} parent - The variable directly around it, e.g. '${self:map.${opt:k}}'
 * @param {string} variable - The nested variable text
 * @param {string} prefix - Variable prefix
 * @param {string} suffix - Variable suffix
 * @returns {boolean}
 */
function isPathSlot(parent, variable, prefix, suffix) {
  if (!parent || !parent.startsWith(prefix) || !parent.endsWith(suffix)) return false
  const inner = parent.slice(prefix.length, parent.length - suffix.length)
  if (/^\s*[A-Za-z_][\w.]*\s*\(/.test(inner) && !/^\s*(?:file|text)\s*\(/.test(inner)) return false
  const at = inner.indexOf(variable)
  if (at < 0) return false
  let depth = 0
  let nested = 0
  let quote = ''
  for (let i = 0; i < at; i++) {
    const ch = inner[i]
    if (quote) { if (ch === quote) quote = ''; continue }
    if (inner.startsWith(prefix, i)) { nested++; i += prefix.length - 1; continue }
    if (nested > 0 && inner.startsWith(suffix, i)) { nested--; i += suffix.length - 1; continue }
    if (nested > 0) continue
    if (ch === "'" || ch === '"') quote = ch
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if ((ch === ',' || ch === '|') && depth === 0) return false
  }
  return depth === 0 && !quote
}

module.exports = {
  variableSpans,
  isFallbackSlot,
  isPathSlot,
  findParentVariable,
  findOutermostBraces,
  findOutermostBracesDepthFirst,
  findOutermostBraceRanges,
  findOutermostVariables,
  findEnclosingVariable
}
