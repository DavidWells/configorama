/**
 * Preprocesses config to fix malformed fallback references,
 * escape variables inside help() filter arguments,
 * and convert bare references in if() expressions
 */
const { splitByComma } = require('../strings/splitByComma')
const { splitOnPipe } = require('../strings/splitOnPipe')
const { scan, references, parentReference } = require('../expressions/scan')
const { extractVariableWrapper } = require('../variables/variableUtils')
const { encodeJsonArgObjects } = require('../encoders/js-fixes')
const { encodeUnknown } = require('../encoders/unknown-values')
const { encodeQuotedLiterals } = require('../encoders/literal-braces')
const { setOwn } = require('../objects')

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
        .flatMap(v => v.prefixes || [v.prefix || v.type])
        .map(prefix => prefix + ':')
        .filter(p => p !== 'dot.prop:' && p !== 'string:' && p !== 'number:')
    : ['self:', 'opt:', 'env:', 'file:', 'text:', 'deep:']

  // Refs the syntax excludes (its (?!AWS|aws:|stageVariables) lookahead) belong to Serverless /
  // CloudFormation / IAM and are never resolved here
  const excludedLookahead = variableSyntax ? /\(\?!([^)]*)\)/.exec(variableSyntax.source) : null
  const escapeRegex = (/** @type {string} */ text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const excludedRefPattern = excludedLookahead && excludedLookahead[1]
    ? new RegExp(`${escapeRegex(varPrefix)}(?:${excludedLookahead[1]})[^${escapeRegex(varSuffix[0])}]*${escapeRegex(varSuffix)}`, 'g')
    : null

  /**
   * An excluded ref inside another variable (${env:X, 'app-${aws:accountId}'}) would stop that
   * variable from matching at all: keep it as an unknown passthrough instead, restored verbatim at
   * the end. Outside any variable (IAM ${aws:username}) it is plain text and left alone.
   * @param {string} str
   * @returns {string}
   */
  function encodeNestedExcludedRefs(str) {
    if (!excludedRefPattern || str.indexOf(varPrefix) === str.lastIndexOf(varPrefix)) return str
    const authoredReferences = references(scan(str, { prefix: varPrefix, suffix: varSuffix }))
    return str.replace(excludedRefPattern, (ref, offset) => {
      const nested = authoredReferences.some(parent => parent.start < offset && parent.end > offset)
      return nested ? encodeUnknown(ref) : ref
    })
  }

  /**
   * Escape variables inside help() filter arguments so main resolver skips them
   * Uses base64 encoding to preserve exact original syntax (supports custom variable syntax)
   * @param {string} str - String potentially containing help() with variables
   * @returns {string} String with help() variables escaped
   */
  function escapeHelpVariables(str) {
    if(typeof str!=='string'||!variableSyntax)return str
    const syntax=scan(str,{prefix:varPrefix,suffix:varSuffix})
    const calls=syntax.nodes.filter(n=>n.kind==='Call'&&n.name==='help'&&n.complete&&parentReference(syntax,n))
    const refs=references(syntax).filter(ref=>ref.complete&&calls.some(call=>ref.start>=call.contentStart&&ref.end<=call.contentEnd))
    const outer=refs.filter(ref=>!refs.some(parent=>parent.start<ref.start&&parent.end>=ref.end)).sort((a,b)=>b.start-a.start)
    let output=str
    for(const ref of outer)output=output.slice(0,ref.start)+require('../encoders/opaque').encode('H',ref.raw)+output.slice(ref.end)
    return output
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
    if(typeof str!=='string')return str
    const syntax=scan(str,{prefix:varPrefix,suffix:varSuffix})
    const candidates=references(syntax).filter(n=>n.complete&&/^\s*if\(/.test(str.slice(n.contentStart,n.contentEnd))).sort((a,b)=>b.start-a.start)
    let output=str
    for(const node of candidates) {
      const call=scan(node.raw,{prefix:varPrefix,suffix:varSuffix}).nodes.find(n=>n.kind==='Call'&&n.name==='if')
      if(!call)continue
      const start=node.start+call.contentStart
      const original=output.slice(start,node.contentEnd)
      const inner=scan(original,{prefix:varPrefix,suffix:varSuffix})
      const refs=references(inner).filter(n=>n.complete)
      const quotes=inner.nodes.filter(n=>(n.kind==='Literal'||n.kind==='Composition')&&/^['"]/.test(n.raw))
      const comparisons=['===','!==','==','!=']
      const inStringComparison=(source,start,end)=>{
        const before=source.slice(0,start).trimEnd();const after=source.slice(end).trimStart()
        return comparisons.some(op=>(after.startsWith(op)&&/^['"]/.test(after.slice(op.length).trimStart()))||new RegExp(`["'][^"']*["']\\s*${op}\\s*$`).test(before))
      }
      const edits=[]
      const bare=/[a-zA-Z_][a-zA-Z0-9_]*(?:[.:][a-zA-Z_][a-zA-Z0-9_]*)+/g
      let match
      while((match=bare.exec(original))) {
        const begin=match.index;const end=begin+match[0].length
        if(refs.concat(quotes).some(n=>n.start<=begin&&n.end>=end))continue
        const ref=varPrefix+match[0]+varSuffix
        edits.push({start:begin,end,text:inStringComparison(original,begin,end)?'"'+ref+'"':ref})
      }
      for(const ref of refs.filter(n=>!refs.some(parent=>parent.start<n.start&&parent.end>=n.end))) {
        if(quotes.some(q=>q.start<ref.start&&q.end>ref.end))continue
        if(inStringComparison(original,ref.start,ref.end))edits.push({start:ref.start,end:ref.end,text:'"'+ref.raw+'"'})
      }
      let processed=original
      for(const edit of edits.sort((a,b)=>b.start-a.start))processed=processed.slice(0,edit.start)+edit.text+processed.slice(edit.end)
      output=output.slice(0,start)+processed+output.slice(node.contentEnd)
    }
    return output
  }

  /**
   * Fix malformed fallback references in a string
   * @param {string} str - String potentially containing variables
   * @returns {string} String with fixed fallback references
   */
  function fixFallbacksInString(str) {
    if(typeof str!=='string')return str
    let output=str
    while(true) {
      const syntax=scan(output,{prefix:varPrefix,suffix:varSuffix});let changed=false
      for(const node of references(syntax).filter(n=>n.complete).sort((a,b)=>(a.end-a.start)-(b.end-b.start))) {
        const content=output.slice(node.contentStart,node.contentEnd)
        const parts=splitByComma(content,variableSyntax)
        if(parts.length<2||parts[0].includes(varPrefix))continue
        const fixed=parts.map((part,index)=>{
          if(index===0)return part
          const trimmed=part.trim()
          if(refPrefixes.some(prefix=>trimmed.startsWith(prefix))&&!(trimmed.startsWith(varPrefix)&&trimmed.endsWith(varSuffix))) {
            const [ref,...filters]=index===parts.length-1?splitOnPipe(trimmed):[trimmed]
            return ` ${varPrefix}${ref.trim()}${varSuffix}${filters.map(f=>` | ${f.trim()}`).join('')}`
          }
          return ` ${trimmed}`
        })
        const replacement=varPrefix+fixed.join(',')+varSuffix
        if(replacement!==node.raw){output=output.slice(0,node.start)+replacement+output.slice(node.end);changed=true;break}
      }
      if(!changed)return output
    }
  }

  /**
   * Recursively traverse and fix the config object
   */
  const seenContainers = new WeakMap()
  function traverseAndFix(obj) {
    require('../resolutionBudget').visit()
    if (typeof obj === 'string') {
      // Early exits: skip expensive processing when patterns are absent
      const hasHelp = obj.indexOf('help(') !== -1
      const hasEvalOrIf = obj.indexOf('if(') !== -1 || obj.indexOf('eval(') !== -1
      const hasComma = obj.indexOf(',') !== -1

      const withExcludedEncoded = encodeNestedExcludedRefs(obj)
      const withHelpEscaped = hasHelp ? escapeHelpVariables(withExcludedEncoded) : withExcludedEncoded
      const withBareRefsConverted = hasEvalOrIf ? convertBareRefsInIf(withHelpEscaped) : withHelpEscaped
      // Encode JSON object literals used as filter/function args so their { } don't break variable matching.
      const withJsonArgsEncoded = obj.indexOf('{') !== -1 ? encodeJsonArgObjects(withBareRefsConverted, varPrefix, varSuffix) : withBareRefsConverted
      // Encode { } $ inside quoted literals (${opt:x, 'a}b'}) so they can't end or break the variable
      const withLiteralsEncoded = encodeQuotedLiterals(withJsonArgsEncoded, varPrefix, varSuffix)
      // Skip fallback fixing for object configs (they handle bare refs differently)
      if (skipFallbackFix || !hasComma) return withLiteralsEncoded
      return fixFallbacksInString(withLiteralsEncoded)
    }

    if (obj && typeof obj === 'object' && seenContainers.has(obj)) return seenContainers.get(obj)
    if (Array.isArray(obj)) {
      const result = new Array(obj.length)
      seenContainers.set(obj, result)
      for (const key of Object.keys(obj)) setOwn(result, key, traverseAndFix(obj[key]))
      return result
    }

    // Rebuild plain objects only; Date and other class instances are values, not maps
    if (obj !== null && typeof obj === 'object' && (Object.getPrototypeOf(obj) === Object.prototype || Object.getPrototypeOf(obj) === null)) {
      const result = Object.create(Object.getPrototypeOf(obj))
      seenContainers.set(obj, result)
      for (const key of Object.keys(obj)) {
        setOwn(result, key, traverseAndFix(obj[key]))
      }
      return result
    }

    return obj
  }

  return traverseAndFix(configObject)
}

module.exports = preProcess
