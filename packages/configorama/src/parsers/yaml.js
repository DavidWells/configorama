const YAML = require('js-yaml')
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
    ymlObject = YAML.load(ymlContents)
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
    yml = YAML.dump(object, {
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
    toml = require('./toml').dump(parse(ymlContents))
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
    json = require('./json5').dump(parse(ymlContents))
  } catch (e) {
    throw new Error(e)
  }
  return json
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
 * Index just past the end of a quoted scalar opening at idx, or -1 if it never closes.
 * Double quotes escape with a backslash; single quotes escape with ''.
 * @param {string} str - YAML text
 * @param {number} idx - Index of the opening quote
 * @returns {number} Index after the closing quote, or -1
 */
function quotedScalarEnd(str, idx) {
  const quote = str[idx]
  for (let i = idx + 1; i < str.length; i++) {
    if (quote === '"' && str[i] === '\\') {
      i++
    } else if (quote === "'" && str[i] === "'" && str[i + 1] === "'") {
      i++
    } else if (str[i] === quote) {
      return i + 1
    }
  }
  return -1
}

/**
 * Index just past the `}` closing the ${...} variable (nested ones included) that
 * starts at idx, or -1 if it doesn't close on the same line
 * @param {string} str - YAML text
 * @param {number} idx - Index of the `$`
 * @returns {number} Index after the closing brace, or -1
 */
function variableEnd(str, idx) {
  let depth = 0
  for (let i = idx + 1; i < str.length && str[i] !== '\n'; i++) {
    if (str[i] === '{') {
      depth++
    } else if (str[i] === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/**
 * Range of a {{resolve:...}} dynamic reference starting at idx, or null. Only a
 * reference without whitespace is quoted; one with whitespace is left as written.
 * @param {string} str - YAML text
 * @param {number} idx - Index of the first `{`
 * @returns {{ end: number, quotable: boolean }|null} End index and whether to quote it
 */
function dynamicReferenceAt(str, idx) {
  if (!str.startsWith('{{resolve:', idx)) return null
  const close = str.indexOf('}}', idx)
  if (close === -1) return null
  return { end: close + 2, quotable: !/\s/.test(str.slice(idx, close + 2)) }
}

/**
 * Scan the flow collection opening at start, matching brackets while skipping quoted
 * scalars, ${...} variables and comments. Collects the ranges to wrap in quotes: bare
 * variables and dynamic references that make up an entry.
 * @param {string} str - YAML text with block scalar content masked
 * @param {number} start - Index of the opening `[` or `{`
 * @returns {{ end: number, quote: Array<[number, number]> }|null} Index after the
 *   closing bracket and ranges to quote, or null if it never closes
 */
function scanFlowCollection(str, start) {
  /** @type {Array<[number, number]>} */
  const quote = []
  let depth = 0
  // At the start of an entry, where a quote opens a quoted scalar and a variable is bare
  let entryStart = true
  for (let i = start; i < str.length; i++) {
    const ch = str[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue
    if (ch === '#' && /\s/.test(str[i - 1])) {
      const nl = str.indexOf('\n', i)
      if (nl === -1) return null
      i = nl - 1
      continue
    }
    if ((ch === '!' || ch === '&') && entryStart) {
      // Skip a tag or anchor; the entry still starts after it
      while (i + 1 < str.length && !/[\s,[\]{}]/.test(str[i + 1])) i++
      continue
    }
    if (ch === '{' && entryStart && i !== start) {
      const ref = dynamicReferenceAt(str, i)
      if (ref) {
        if (ref.quotable) quote.push([i, ref.end])
        i = ref.end - 1
        entryStart = false
        continue
      }
    }
    if (ch === '[' || ch === '{') {
      depth++
      entryStart = true
    } else if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0) return { end: i + 1, quote }
      entryStart = false
    } else if (ch === ',' || ch === ':' || ch === '?') {
      entryStart = true
    } else if ((ch === '"' || ch === "'") && entryStart) {
      const end = quotedScalarEnd(str, i)
      if (end === -1) return null
      i = end - 1
      entryStart = false
    } else if (ch === '$' && str[i + 1] === '{') {
      const end = variableEnd(str, i)
      if (end === -1) return null
      // Wrapping a variable whose own text has a double quote (${opt:x, "d"}) would nest quotes
      if (entryStart && str.slice(i, end).indexOf('"') === -1) quote.push([i, end])
      i = end - 1
      entryStart = false
    } else {
      entryStart = false
    }
  }
  return null
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

  // Wrap bare variables in flow collections in quotes so the YAML parser reads them as strings
  // in  -> y: !Not [!Equals [!Join ['', ${param:xyz}]]]
  // out -> y: !Not [!Equals [!Join ['', "${param:xyz}"]]]
  // Automagically wrap CF https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-ssm.html
  if (!ymlStr || (ymlStr.indexOf('[') === -1 && ymlStr.indexOf('{') === -1)) return ymlStr

  // Scan with block scalar content blanked: brackets there are literal text
  const scanStr = maskBlockScalars(ymlStr)
  /** @type {Array<[number, number]>} */
  const quote = []
  // Let the native scanner skip text without flow openers. Each invocation has
  // its own regex cursor; recognized collections/references advance it exactly
  // as the previous character loop did.
  const openers = /[\[{]/g
  let match
  while ((match = openers.exec(scanStr)) !== null) {
    const i = match.index
    if (!opensFlowCollection(ymlStr, i)) continue
    const ref = dynamicReferenceAt(scanStr, i)
    if (ref) {
      if (ref.quotable) quote.push([i, ref.end])
      openers.lastIndex = ref.end
      continue
    }
    const flow = scanFlowCollection(scanStr, i)
    if (!flow) continue
    quote.push(...flow.quote)
    openers.lastIndex = flow.end
  }

  // Apply right-to-left so earlier indices stay valid
  for (let i = quote.length - 1; i >= 0; i--) {
    const [start, end] = quote[i]
    ymlStr = `${ymlStr.slice(0, start)}"${ymlStr.slice(start, end)}"${ymlStr.slice(end)}`
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
