const YAML = require('js-yaml')
const TOML = require('./toml')
const JSON = require('./json5')
const { findOutermostVariables, findOutermostBraceRanges } = require('../utils/strings/bracketMatcher')
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

/*
 * A line that opens a block scalar: optional `- ` sequence dashes, optional `key: `,
 * optional tags/anchors (!Sub, &a), then `|` or `>` with optional indentation/chomping
 * indicators (|2, |-, >+2) and an optional trailing comment.
 */
const BLOCK_SCALAR_HEADER = /^((?:[ \t]*-(?=[ \t]))*[ \t]*)([^\s#][^\n]*?:[ \t]+)?(?:[!&][^\s]*[ \t]+)*[|>](?:[1-9][+-]?|[+-][1-9]?)?[ \t]*(?:#.*)?$/

/**
 * Blank out the content of YAML block scalars (| > and variants) with spaces, keeping
 * every index and newline in place. Block scalar content is literal text, so scans for
 * flow collections must not see it. Content is every line after the header that is
 * blank or indented deeper than the header's key (or its last `-` for `- |` items).
 * @param {string} ymlStr - Raw YAML text
 * @returns {string} Same-length text with block scalar content replaced by spaces
 */
function maskBlockScalars(ymlStr) {
  if (ymlStr.indexOf('|') === -1 && ymlStr.indexOf('>') === -1) return ymlStr
  const lines = ymlStr.split('\n')
  let baseIndent = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (baseIndent > -1) {
      const indent = line.length - line.replace(/^[ \t]*/, '').length
      if (!line.trim() || indent > baseIndent) {
        lines[i] = ' '.repeat(line.length)
        continue
      }
      baseIndent = -1
    }
    // Drop a CRLF line ending's \r so the header pattern's $ matches
    const header = line.replace(/\r$/, '').match(BLOCK_SCALAR_HEADER)
    if (header) {
      const lead = header[1]
      const hasKey = !!header[2]
      const lastDash = lead.lastIndexOf('-')
      baseIndent = (hasKey || lastDash === -1) ? lead.length : lastDash
    }
  }
  return lines.join('\n')
}

/*
 * Text before a `[` or `{` on its line when that bracket starts a value: indentation
 * only, `key: `, a `- ` or `? ` item, `"key":` (JSON style), or `[` `{` `,` of an
 * enclosing flow collection, optionally followed by tags/anchors (!Join, &a).
 */
const FLOW_START_PREFIX = /(?:^|[[{,]|["']:|:[ \t]|(?:^|[ \t])[-?][ \t])[ \t]*(?:[!&][^\s[\]{},]*[ \t]+)*$/

/**
 * Whether the `[` or `{` at idx opens a YAML flow collection. A bracket inside a
 * quoted scalar ("{${x}}") or mid plain scalar (echo a[${x}]) is literal text, and
 * wrapping vars inside it would inject quotes into the value or break parsing.
 * @param {string} ymlStr - YAML text
 * @param {number} idx - Index of the `[` or `{`
 * @returns {boolean} True if the bracket starts a flow collection
 */
function opensFlowCollection(ymlStr, idx) {
  const lineStart = ymlStr.lastIndexOf('\n', idx - 1) + 1
  const nl = ymlStr.indexOf('\n', idx)
  const lineText = ymlStr.slice(lineStart, nl === -1 ? undefined : nl)
  const col = idx - lineStart
  if (isInsideQuotes(lineText, col)) return false
  return FLOW_START_PREFIX.test(lineText.slice(0, col))
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
    // quoted scalar (key: "[${x}]") or plain scalar (key: echo a[${x}]), where a real
    // flow array's `[` is never inside quotes and always starts a value. Apply
    // right-to-left so earlier indices stay valid.
    /** @type {Array<[number, number, string]>} */
    const edits = []
    // Scan with block scalar content blanked; a match that differs from the real
    // text overlaps block scalar content and is left alone.
    const scanStr = maskBlockScalars(ymlStr)
    for (const m of scanStr.matchAll(INNER_ARRAY)) {
      const idx = m.index
      if (typeof idx !== 'number') continue
      const txt = ymlStr.slice(idx, idx + m[0].length)
      if (txt !== m[0]) continue
      if (!opensFlowCollection(ymlStr, idx)) continue
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
  const objScanStr = maskBlockScalars(ymlStr)
  if (objScanStr.indexOf('{') > -1) {
    // Flow mappings outside block scalar content, as [start, end) ranges into ymlStr
    const ranges = findOutermostBraceRanges(objScanStr)
      .filter(([start, end]) => objScanStr.slice(start, end) === ymlStr.slice(start, end))
      .filter(([start]) => opensFlowCollection(ymlStr, start))
    const values = ranges.map(([start, end]) => ymlStr.slice(start, end))
    // console.log('values', values)
    /** @type {Array<[number, number, string]>} */
    const objEdits = []
    ranges.forEach(([start, end], i) => {
      const txt = values[i]
      // Automagically wrap CF https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-ssm.html
      if (txt.match(/{{resolve:/)) {
        if (!txt.match(/\s/)) objEdits.push([start, end, `"${txt}"`])
        return
      }
      // console.log('obj text', txt)
      const hasNestedVars = txt && findOutermostVariables(txt)
      if (hasNestedVars && hasNestedVars.length) {
        const fixedText = wrapBareVariables(txt)
        if (fixedText !== txt) {
          objEdits.push([start, end, fixedText])
        }
      }
    })
    for (let i = objEdits.length - 1; i >= 0; i--) {
      const [start, end, rep] = objEdits[i]
      ymlStr = ymlStr.slice(0, start) + rep + ymlStr.slice(end)
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
