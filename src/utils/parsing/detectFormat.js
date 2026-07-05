// Detects a config file's format from raw content when its name/extension is
// ambiguous. Returns a file-extension string for the parser dispatch in parse.js.
// Best-effort heuristic — an explicit, recognized extension always wins over this.

/**
 * Whether every meaningful line is a flat KEY=VALUE assignment (dotenv shape).
 * Deliberately variable-syntax-agnostic: it inspects line structure, not the
 * variable delimiters, so it works whether a config uses ${...}, $[...], or a
 * custom syntax. Blank lines and #/; comments are ignored.
 * @param {string} text - Trimmed file contents
 * @returns {boolean} True for flat key=value content with no YAML/TOML structure
 */
function isFlatKeyValue(text) {
  const lines = text.split('\n')
  let assignments = 0
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    if (/^(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=/.test(line)) {
      assignments++
      continue
    }
    // A non-blank, non-comment line that isn't an assignment (e.g. a YAML
    // mapping, a TOML section, or freeform text) — not a flat env file.
    return false
  }
  return assignments > 0
}

/**
 * Detect config format from file contents when the extension is missing or
 * unrecognized.
 * @param {string} contents - Raw file contents
 * @returns {string} Detected file extension (e.g. '.json', '.yml', '.toml', '.env')
 */
function detectFormat(contents) {
  const trimmed = contents.trimStart()

  // JSON object: starts with {
  if (trimmed[0] === '{') return '.json'

  // TOML section headers must be checked before JSON array (both start with [)
  // TOML: [section.subsection] (dots distinguish from INI)
  if (/^\[[\w-]+\.[\w.-]+\]/.test(trimmed)) return '.toml'
  // TOML: array-of-tables [[section]]
  if (/^\[\[[\w.-]+\]\]/.test(trimmed)) return '.toml'

  // JSON array: starts with [ followed by non-word char (quotes, numbers, braces, whitespace)
  if (trimmed[0] === '[') return '.json'

  // TOML: multi-line strings
  if (trimmed.startsWith('"""')) return '.toml'

  // YAML: starts with document marker
  if (trimmed.startsWith('---')) return '.yml'

  // HCL: terraform keywords
  if (/^(resource|variable|locals|provider|data|module|output|terraform)\s/.test(trimmed)) return '.tf'

  // Flat KEY=VALUE content (env-file shape) -> dotenv parser. dotenv is lossless
  // for string values, which is what configorama resolves ${...} into. TOML
  // errors on unquoted values; ini truncates values at ';' (breaks connection
  // strings) and mangles 'export' prefixes.
  if (isFlatKeyValue(trimmed)) return '.env'

  // Default: YAML (most permissive parser)
  return '.yml'
}

module.exports = { detectFormat, isFlatKeyValue }
