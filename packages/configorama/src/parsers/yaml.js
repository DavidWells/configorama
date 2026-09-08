const YAML = require('js-yaml')
const TOML = require('./toml')
const JSON = require('./json5')
const { findOutermostVariables, findOutermostBracesDepthFirst } = require('../utils/strings/bracketMatcher')
const { isInsideQuotes } = require('../utils/strings/quoteAware')

/**
 * Loader for custom CF syntax
 * @param {string|Buffer} contents - YAML content to load
 * @param {Object} [options] - YAML load options
 * @returns {{data: Object|null, error: Error|null}} Parsed data and error if any
 */
function load(contents, options) {
  let data
  let error
  try {
    data = YAML.load(contents.toString(), options || {})
  } catch (exception) {
    error = exception
  }
  return { data, error }
}

/**
 * Parse YAML content into JavaScript object
 * @param {string} ymlContents - YAML string to parse
 * @returns {Object} Parsed YAML object
 * @throws {Error} If YAML parsing fails
 */
function parse(ymlContents) {
  // Get document, or throw exception on error
  let ymlObject = {}
  try {
    ymlObject = YAML.safeLoad(ymlContents)
  } catch (e) {
    throw new Error(e)
  }
  return ymlObject
}

/**
 * Convert JavaScript object to YAML string
 * @param {Object} object - Object to convert to YAML
 * @returns {string} YAML string representation
 * @throws {Error} If conversion fails
 */
function dump(object) {
  let yml
  try {
    yml = YAML.safeDump(object, {
      noRefs: true
    })
  } catch (e) {
    throw new Error(e)
  }
  return yml
}

/**
 * Convert YAML content to TOML format
 * @param {string} ymlContents - YAML string to convert
 * @returns {string} TOML string representation
 * @throws {Error} If conversion fails
 */
function toToml(ymlContents) {
  let toml
  try {
    toml = TOML.dump(parse(ymlContents))
  } catch (e) {
    throw new Error(e)
  }
  return toml
}

/**
 * Convert YAML content to JSON format
 * @param {string} ymlContents - YAML string to convert
 * @returns {string} JSON string representation
 * @throws {Error} If conversion fails
 */
function toJson(ymlContents) {
  let json
  try {
    json = JSON.dump(parse(ymlContents))
  } catch (e) {
    throw new Error(e)
  }
  return json
}

// Alias for backward compatibility
const matchOutermostBraces = findOutermostBracesDepthFirst

// https://regex101.com/r/XIltbc/1
const KEY_OBJECT = /^[ \t]*[^":\s]*:\s+\{/gm

const INNER_ARRAY = /\[(?:[^\[\]])*\]/g

/**
 * Wrap BARE ${...} variables (those not already inside a quoted scalar) in double
 * quotes so the YAML parser treats them as strings instead of choking on `${`.
 * A variable already inside a quoted element like ['arn/${env:X}'] is already a safe
 * string, so wrapping it would inject literal quotes into the resolved value. A
 * variable whose own text contains a double quote (e.g. a ${opt:x, "def"} fallback)
 * is skipped, since double-wrapping it would produce invalid nested quotes; a
 * variable containing only single quotes is safe to wrap in double quotes.
 * @param {string} txt - A flow array/object substring containing variables
 * @returns {string} The substring with bare variables wrapped
 */
function wrapBareVariables(txt) {
  // findOutermostVariables returns one entry per occurrence, so dedupe first.
  const uniqueVars = [...new Set(findOutermostVariables(txt))]
  const wraps = []
  uniqueVars.forEach((nested) => {
    if (nested.indexOf('"') > -1) return
    let from = 0
    let idx
    while ((idx = txt.indexOf(nested, from)) > -1) {
      if (!isInsideQuotes(txt, idx)) {
        wraps.push([idx, idx + nested.length])
      }
      from = idx + nested.length
    }
  })
  if (!wraps.length) return txt
  /* Wrap right-to-left so earlier indices stay valid */
  wraps.sort((a, b) => b[0] - a[0])
  let fixedText = txt
  for (const [start, end] of wraps) {
    fixedText = `${fixedText.slice(0, start)}"${fixedText.slice(start, end)}"${fixedText.slice(end)}`
  }
  return fixedText
}

/**
 * Pre-process YAML string to handle nested variables and CloudFormation syntax
 * @param {string} [ymlStr=''] - YAML string to pre-process
 * @returns {string} Pre-processed YAML string
 */
function preProcess(ymlStr = '') {
  /*
  return ymlStr
  /** */

  // Fix nested variables in array brackets
  // in  -> y: !Not [!Equals [!Join ['', ${param:xyz}]]]
  // out -> y: !Not [!Equals [!Join ['', "${param:xyz}"]]]
  if (ymlStr && ymlStr.indexOf('[') > -1) {
    // Collect edits by index so we can skip brackets that are literal content of a
    // quoted scalar (key: "[${x}]"), where a real flow array's `[` is never inside
    // quotes. Apply right-to-left so earlier indices stay valid.
    /** @type {Array<[number, number, string]>} */
    const edits = []
    for (const m of ymlStr.matchAll(INNER_ARRAY)) {
      const txt = m[0]
      const idx = m.index
      if (typeof idx !== 'number') continue
      const lineStart = ymlStr.lastIndexOf('\n', idx - 1) + 1
      const nl = ymlStr.indexOf('\n', idx)
      const lineText = ymlStr.slice(lineStart, nl === -1 ? undefined : nl)
      if (isInsideQuotes(lineText, idx - lineStart)) continue
      const hasNestedVars = findOutermostVariables(txt)
      if (!hasNestedVars || !hasNestedVars.length) continue
      const fixedText = wrapBareVariables(txt)
      if (fixedText !== txt) {
        edits.push([idx, idx + txt.length, fixedText])
      }
    }
    for (let i = edits.length - 1; i >= 0; i--) {
      const [start, end, rep] = edits[i]
      ymlStr = ymlStr.slice(0, start) + rep + ymlStr.slice(end)
    }
  }

  /* If have yaml object and vars not wrapped in quotes, wrap them */
  if (ymlStr.match(KEY_OBJECT)) {
    const values = matchOutermostBraces(ymlStr)
    // console.log('values', values)
    const hasObjects = values.filter((x) => !x.match(/{{resolve:/))
    // console.log('hasObjects', hasObjects)
    if (hasObjects && hasObjects.length) {
      hasObjects.forEach((txt) => {
        // console.log('obj text', txt)
        const hasNestedVars = txt && findOutermostVariables(txt)
        if (hasNestedVars && hasNestedVars.length) {
          const fixedText = wrapBareVariables(txt)
          if (fixedText !== txt) {
            ymlStr = ymlStr.replace(txt, fixedText)
          }
        }
      })
    }
    // Automagically wrap CF https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-ssm.html 
    const cfParams = values.filter((x) => !x.match(/\s/) && x.match(/{{resolve:/))
    if (cfParams && cfParams.length) {
      cfParams.forEach((txt) => {
        const pat = new RegExp(`([^'"])${txt}([^'"])`, 'g')
        const fixedText = `$1"${txt}"$2`
        ymlStr = ymlStr.replace(pat, fixedText)
      })
    }
  }
  // console.log('ymlStr', ymlStr)
  return ymlStr
}

module.exports = {
  preProcess: preProcess,
  parse: parse,
  load: load,
  dump: dump,
  toToml: toToml,
  toJson: toJson
}
