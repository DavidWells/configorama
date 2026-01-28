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

  // +++ delimiters → TOML
  if (fileContents.startsWith('+++\n')) {
    const endIdx = fileContents.indexOf('\n+++', 4)
    if (endIdx === -1) return noMatch
    const frontmatterContent = fileContents.slice(4, endIdx)
    const content = fileContents.slice(endIdx + 4)
    return { frontmatterContent, content, format: 'toml' }
  }

  // --- delimiters → detect format from content
  if (fileContents.startsWith('---\n')) {
    const endIdx = fileContents.indexOf('\n---', 4)
    if (endIdx === -1) return noMatch
    const frontmatterContent = fileContents.slice(4, endIdx)
    const content = fileContents.slice(endIdx + 4)
    const format = detectSyntax(frontmatterContent)
    return { frontmatterContent, content, format }
  }

  // <!-- --> comment frontmatter (strict: position 0)
  if (fileContents.startsWith('<!--\n')) {
    const endIdx = fileContents.indexOf('\n-->', 5)
    if (endIdx === -1) return noMatch
    const frontmatterContent = fileContents.slice(5, endIdx)
    const content = fileContents.slice(endIdx + 4)
    const format = detectSyntax(frontmatterContent)
    return { frontmatterContent, content, format }
  }

  return noMatch
}

module.exports = {
  extractFrontmatter,
  detectSyntax
}
