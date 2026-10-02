const { scan, references } = require('../expressions/scan')
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
  const at=typeof index==='number'?index:text.indexOf(variable)
  if(at<0||text.slice(at,at+variable.length)!==variable)return null
  const spans=references(scan(text,{prefix,suffix})).filter(n=>n.complete&&n.start<=at&&n.end>=at+variable.length)
  return spans.length?spans.sort((a,b)=>a.start-b.start||b.end-a.end)[0].raw:null
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
  return references(scan(text,{prefix,suffix})).filter(n=>n.complete).sort((a,b)=>a.end-b.end||b.start-a.start).map(n=>({start:n.start,end:n.end}))
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
  if(!prefix||!suffix||text.slice(index,index+variable.length)!==variable)return null
  const parent=references(scan(text,{prefix,suffix})).filter(n=>n.complete&&n.start<index&&n.end>=index+variable.length).sort((a,b)=>b.start-a.start)[0]
  return parent?{start:parent.start,text:parent.raw}:null
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
  if(!enclosing||!enclosing.startsWith(prefix)||!enclosing.endsWith(suffix))return false
  const syntax=scan(enclosing,{prefix,suffix});const root=references(syntax).find(n=>n.start===0)
  if(!root)return false
  return syntax.nodes.some(n=>n.parentId===root.id&&n.kind==='Fallback'&&n.itemIndex>0&&n.raw.trim().startsWith(variable))
}

/**
 * Whether `variable` is a whole fallback item of the `enclosing` variable expression: in a
 * fallback slot (see isFallbackSlot) with only whitespace before the next top-level comma,
 * filter pipe or the end (${env:X, ${self:a}}), not the start of a longer item
 * (${env:X, ${self:a}-${self:b}}).
 * @param {string} enclosing - Enclosing variable text, e.g. '${env:X, ${self:y}}'
 * @param {string} variable - The nested variable text, e.g. '${self:y}'
 * @param {string} prefix - Variable prefix
 * @param {string} suffix - Variable suffix
 * @returns {boolean}
 */
function isWholeFallbackItem(enclosing, variable, prefix, suffix) {
  if(!isFallbackSlot(enclosing,variable,prefix,suffix))return false
  const syntax=scan(enclosing,{prefix,suffix});const root=references(syntax).find(n=>n.start===0)
  return syntax.nodes.some(n=>n.parentId===root.id&&n.kind==='Fallback'&&n.itemIndex>0&&n.raw.trim()===variable)
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
  if(!parent||!parent.startsWith(prefix)||!parent.endsWith(suffix))return false
  const syntax=scan(parent,{prefix,suffix});const at=parent.indexOf(variable,prefix.length)
  const nested=references(syntax).find(n=>n.start===at)
  if(!nested)return false
  let id=nested.parentId
  while(id!==null) {
    const node=syntax.nodes[id]
    if(node.kind==='Call'||node.kind==='Argument'||node.kind==='Filter')return false
    if((node.kind==='Literal'||node.kind==='Composition')&&/^\s*["']/.test(node.raw))return false
    if(node.kind==='Fallback'&&node.itemIndex>0)return false
    if(node.kind==='Reference')return node.start===0
    id=node.parentId
  }
  return false
}

module.exports = {
  variableSpans,
  isFallbackSlot,
  isWholeFallbackItem,
  isPathSlot,
  findParentVariable,
  findOutermostBraces,
  findOutermostBracesDepthFirst,
  findOutermostBraceRanges,
  findOutermostVariables,
  findEnclosingVariable
}
