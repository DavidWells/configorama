/* Splits string on single pipe (|) but preserves double pipes (||) and pipes inside filter-argument parens */

/**
 * Splits a string on single pipe (|) characters used as filter delimiters, while preserving:
 *   - double pipes (||), which are a logical-OR operator, not a filter delimiter
 *   - any pipe inside a parenthesised filter-argument list, e.g. append('|bar') or replace('a|b','c')
 * Quotes are only significant inside parens (to keep a literal ')' from closing the arg list early);
 * an outer quote that wraps the whole expression (e.g. "5432 | Number") does NOT protect its pipes.
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
      current += ch
      if (ch === quote) quote = null
      continue
    }

    // Only treat quotes as arg strings when inside a filter-argument list
    if (depth > 0 && (ch === "'" || ch === '"')) {
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

module.exports = { splitOnPipe }
