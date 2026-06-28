const { findLineByPath, findLineForKey } = require('../paths/findLineForKey')
const { parseCommentAnnotations } = require('./commentAnnotations')

function getCommentMarkers(fileType) {
  if (fileType === '.json') return []
  if (fileType === '.json5' || fileType === '.jsonc') return ['//']
  if (fileType === '.hcl') return ['//', '#']
  if (['.yml', '.yaml', '.toml', '.ini'].includes(fileType)) return ['#']
  return ['#', '//']
}

function isDecorationComment(text) {
  return /^[\s\-=_*]{3,}$/.test(text)
}

function stripCommentMarker(line, marker) {
  return line.trim().slice(marker.length).replace(/^\s?/, '')
}

function findCommentStart(line, markers) {
  let quote = null
  let variableDepth = 0

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const prev = i > 0 ? line[i - 1] : ''

    if (!quote && char === '$' && line[i + 1] === '{') {
      variableDepth++
      i++
      continue
    }
    if (!quote && variableDepth > 0 && char === '}') {
      variableDepth--
      continue
    }
    if ((char === "'" || char === '"') && prev !== '\\') {
      if (!quote) quote = char
      else if (quote === char) quote = null
      continue
    }
    if (quote || variableDepth > 0) continue

    for (const marker of markers) {
      if (line.slice(i, i + marker.length) === marker) {
        return { index: i, marker }
      }
    }
  }

  return null
}

function getLineNumber(configPath, lines, fileType) {
  if (['.yml', '.yaml', '.json5', '.jsonc'].includes(fileType)) {
    const byPath = findLineByPath(configPath, lines, fileType)
    if (byPath) return byPath
  }

  if (fileType === '.json') return 0
  const key = String(configPath).split('.').pop()
  return findLineForKey(key, lines, fileType)
}

function getLeadingComment(lines, lineIndex, markers) {
  const comments = getLeadingCommentLines(lines, lineIndex, markers)
  return comments.length ? comments.join(' ') : null
}

function getLeadingCommentLines(lines, lineIndex, markers) {
  const comments = []
  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line || line.trim() === '') break

    const trimmed = line.trim()
    const marker = markers.find(item => trimmed.startsWith(item))
    if (!marker) break

    const text = stripCommentMarker(trimmed, marker).trim()
    if (text && !isDecorationComment(text)) comments.unshift(text)
  }

  return comments
}

function hasAnnotations(annotations) {
  return annotations && Object.keys(annotations).length > 0
}

function buildCommentResult(commentLines, fallbackDescriptionSource) {
  const parsed = parseCommentAnnotations(commentLines)
  if (!parsed.description && !hasAnnotations(parsed.annotations)) return null

  const result = {}
  if (parsed.description) {
    result.description = parsed.description
    result.descriptionSource = parsed.descriptionSource || fallbackDescriptionSource
  }

  if (hasAnnotations(parsed.annotations)) {
    result.annotations = parsed.annotations
    for (const [key, value] of Object.entries(parsed.annotations)) {
      if (key === 'description') continue
      result[key] = value
    }
  }

  return result
}

function extractComment(configPath, lines, fileType) {
  try {
    const markers = getCommentMarkers(fileType)
    if (!markers.length || !configPath || !Array.isArray(lines) || !lines.length) return null

    const lineNumber = getLineNumber(configPath, lines, fileType)
    if (!lineNumber) return null

    const lineIndex = lineNumber - 1
    const line = lines[lineIndex] || ''
    const inlineStart = findCommentStart(line, markers)
    if (inlineStart) {
      const text = stripCommentMarker(line.slice(inlineStart.index), inlineStart.marker).trim()
      if (text && !isDecorationComment(text)) {
        return buildCommentResult([text], 'comment')
      }
    }

    const leading = getLeadingCommentLines(lines, lineIndex, markers)
    const result = buildCommentResult(leading, 'leadingComment')
    if (result) return result
  } catch (error) {
    return null
  }

  return null
}

module.exports = {
  extractComment,
  findCommentStart,
  getCommentMarkers,
  getLeadingComment,
}
