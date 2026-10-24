// Extracts and detects frontmatter format from markdown/MDX files

/**
 * Detect frontmatter syntax format from raw content
 * @param {string} rawFrontmatter - Raw frontmatter string (without delimiters)
 * @returns {'yaml'|'toml'|'json'} Detected format
 */
function detectSyntax(rawFrontmatter) {
  const trimmed = rawFrontmatter.trim()
  if (trimmed.startsWith('{')) {
    return 'json'
  }
  if (/^\[[\w.-]+\]/m.test(trimmed)) {
    return 'toml'
  }
  return 'yaml'
}

/** @type {Array<[string, string, 'toml'|null]>} [opening line, closing marker, format (null: detect from content)] */
const FRONTMATTER_DELIMITERS = [
  // +++ delimiters → TOML
  ['+++\n', '\n+++', 'toml'],
  // --- delimiters → detect format from content
  ['---\n', '\n---', null],
  // <!-- --> comment frontmatter (strict: position 0)
  ['<!--\n', '\n-->', null],
]

/**
 * Extract frontmatter and body content from a markdown file
 * @param {string} fileContents - Full file contents
 * @returns {{ frontmatterContent: string|null, content: string, format: 'yaml'|'toml'|'json'|null }}
 */
function extractFrontmatter(fileContents) {
  const noMatch = { frontmatterContent: null, content: fileContents, format: null }

  if (!fileContents) {
    return noMatch
  }

  // Normalize CRLF to LF for consistent delimiter matching
  fileContents = fileContents.replace(/\r\n/g, '\n')

  for (const [open, close, fixedFormat] of FRONTMATTER_DELIMITERS) {
    if (!fileContents.startsWith(open)) continue
    const endIdx = fileContents.indexOf(close, open.length)
    if (endIdx === -1) return noMatch
    const frontmatterContent = fileContents.slice(open.length, endIdx)
    const content = fileContents.slice(endIdx + close.length)
    const format = fixedFormat || detectSyntax(frontmatterContent)
    return { frontmatterContent, content, format }
  }

  return noMatch
}

module.exports = {
  extractFrontmatter,
  detectSyntax
}
