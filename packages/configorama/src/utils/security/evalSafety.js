// Blocks prototype-chain escapes in ${eval(...)} / ${if(...)} expressions.
// Literals like "" or [] expose .constructor, which reaches the Function
// constructor and arbitrary code execution. We reject access to those property
// names (statically or via dynamic computed keys) before any evaluation runs.

// Property names that walk the prototype chain toward the Function constructor.
const FORBIDDEN_KEYS = new Set([
  'constructor',
  'prototype',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
])

// Fast pre-filter on the raw source. Catches the dotted / literal-bracket forms
// directly; the AST walk below also catches concatenated keys it cannot see.
const SOURCE_ESCAPE_PATTERN = /\b(?:constructor|prototype|__proto__|__define[GS]etter__|__lookup[GS]etter__)\b/

/**
 * Walk a subscript/justin AST and return the first disallowed access found.
 * Node shapes: [null, literal] | ['.', obj, propName] | ['[]', obj, keyNode] |
 * [op, ...children]; bare identifiers are plain strings.
 * @param {*} node - a subscript AST node
 * @returns {string|null} the offending key (or '<computed-key>'), else null
 */
function findForbiddenAccess(node) {
  if (!Array.isArray(node)) return null
  const op = node[0]
  // Literal nodes are [<hole>, value]; the hole reads back as undefined.
  if (op == null) return null

  // Static and optional member access: ['.', obj, name] / ['?.', obj, name]
  if (op === '.' || op === '?.') {
    const prop = node[2]
    if (typeof prop === 'string' && FORBIDDEN_KEYS.has(prop)) return prop
    return findForbiddenAccess(node[1])
  }

  if (op === '[]') {
    const key = node[2]
    if (Array.isArray(key) && key[0] == null) {
      const value = key[1]
      if (typeof value === 'string' && FORBIDDEN_KEYS.has(value)) return value
    } else {
      // Non-literal key (e.g. "con" + "structor"); cannot be verified statically.
      return '<computed-key>'
    }
    return findForbiddenAccess(node[1])
  }

  for (let i = 1; i < node.length; i++) {
    const found = findForbiddenAccess(node[i])
    if (found) return found
  }
  return null
}

/**
 * Throw if an eval expression attempts a prototype-chain escape.
 * @param {string} expression - the raw expression inside eval(...)
 * @param {*} [ast] - the parsed subscript AST, when available
 */
function assertSafeEvalExpression(expression, ast) {
  if (ast) {
    // Precise: walk the parsed AST so literal strings like "constructor" used as
    // data are allowed, while actual member access to them is blocked.
    const bad = findForbiddenAccess(ast)
    if (bad) {
      throw new Error(`Blocked eval expression "${expression}": disallowed member access (${bad}).`)
    }
    return
  }
  // Fallback when the expression could not be parsed: blunt source scan.
  if (SOURCE_ESCAPE_PATTERN.test(String(expression))) {
    throw new Error(`Blocked eval expression "${expression}": access to constructor/prototype is not allowed.`)
  }
}

module.exports = {
  FORBIDDEN_KEYS,
  SOURCE_ESCAPE_PATTERN,
  findForbiddenAccess,
  assertSafeEvalExpression,
}
