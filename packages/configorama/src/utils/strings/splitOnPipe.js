/* Splits string on single pipe (|) but preserves double pipes (||) and pipes inside filter-argument parens */

/**
 * Splits a string on single pipe (|) characters used as filter delimiters, while preserving:
 *   - double pipes (||), which are a logical-OR operator, not a filter delimiter
 *   - any pipe inside a parenthesised filter-argument list, e.g. append('|bar') or replace('a|b','c')
 * Quotes are significant inside parens (to keep a literal ')' from closing the arg list early) and
 * around a quoted item, i.e. a quote opening the string or right after a comma ('a|b', opt:x, 'a|b'),
 * whose pipes are literal text. A quote mid-item (it's | f) protects nothing.
 * A bare single pipe at paren-depth 0 (including bitwise |) still splits.
 * @param {string} str - String to split
 * @returns {string[]} - Array of parts split on filter-delimiter pipes
 */
function splitOnPipe(str) {
  if (!str || typeof str !== 'string') return [str]

  const parts = []
  let current = ''
  let depth = 0 // parenthesis nesting depth
  /** @type {string|null} */
  let quote = null // open quote char while inside a quoted arg (only tracked when depth > 0)

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]

    // Inside a quoted arg: copy verbatim, close only on the matching quote char
    if (quote) {
      // An escaped char (\' in 'it\'s') doesn't close the quote
      if (ch === '\\' && i + 1 < str.length) {
        current += ch + str[i + 1]
        i++
        continue
      }
      current += ch
      if (ch === quote) quote = null
      continue
    }

    // Treat quotes as literal strings inside a filter-argument list or a quoted fallback item
    if ((ch === "'" || ch === '"') && (depth > 0 || /(^|,)[ \t]*$/.test(current))) {
      quote = ch
      current += ch
      continue
    }

    if (ch === '(') {
      depth++
      current += ch
      continue
    }
    if (ch === ')') {
      if (depth > 0) depth--
      current += ch
      continue
    }

    if (ch === '|') {
      // Double pipe (logical OR) — keep both, do not split
      if (str[i + 1] === '|') {
        current += '||'
        i++
        continue
      }
      // Single pipe inside a filter-argument list — literal, part of the argument
      if (depth > 0) {
        current += ch
        continue
      }
      // Single pipe at depth 0 — filter delimiter
      parts.push(current)
      current = ''
      continue
    }

    current += ch
  }

  parts.push(current)
  return parts
}

/**
 * splitOnPipe for the text inside a variable, ignoring pipes inside nested variables: the
 * filters of `a, ${b | f} | g` are just `g`
 * @param {string} str - Text inside a variable
 * @param {string} prefix - Variable prefix, e.g. '${'
 * @param {string} suffix - Variable suffix, one character, e.g. '}'
 * @returns {string[]} Parts, as splitOnPipe gives them
 */
function splitOnTopLevelPipe(str, prefix, suffix) {
  if (!str || typeof str !== 'string') return [str]
  // Mask nested variables with same-length filler so their pipes can't split
  let masked = ''
  let depth = 0
  for (let i = 0; i < str.length; i++) {
    if (str.startsWith(prefix, i)) {
      depth++
      masked += '_'.repeat(prefix.length)
      i += prefix.length - 1
    } else if (str[i] === suffix && depth > 0) {
      depth--
      masked += '_'
    } else {
      masked += depth > 0 ? '_' : str[i]
    }
  }
  const parts = []
  let at = 0
  for (const part of splitOnPipe(masked)) {
    parts.push(str.slice(at, at + part.length))
    at += part.length + 1
  }
  return parts
}

module.exports = { splitOnPipe, splitOnTopLevelPipe }
