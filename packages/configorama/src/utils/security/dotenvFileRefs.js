const path = require('path')
const { normalizePath } = require('../paths/filePathUtils')
const { splitCsv } = require('../strings/splitCsv')
const { trimSurroundingQuotes } = require('../strings/quoteUtils')

const DOTENV_SENSITIVITY_REASON = 'dotenv_file'

function isDotenvFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false
  const cleanPath = filePath.trim().replace(/^["']|["']$/g, '')
  const baseName = path.basename(cleanPath)
  return baseName === '.env' || baseName.startsWith('.env.')
}

function hasFileAccessor(variableString) {
  const expression = extractFileExpression(variableString)
  if (!expression) return false
  const suffix = String(variableString || '').slice(expression.end).trim()
  return suffix.startsWith(':') || suffix.startsWith('.')
}

function extractFileExpression(variableString) {
  const value = String(variableString || '')
  const prefixMatch = /(?:^|[^\w.])((?:file|text)\()/.exec(value)
  if (!prefixMatch) return null

  const expressionStart = prefixMatch.index + prefixMatch[0].indexOf(prefixMatch[1])
  const openParenIndex = expressionStart + prefixMatch[1].length - 1
  let depth = 1
  let index = openParenIndex + 1

  while (index < value.length && depth > 0) {
    if (value[index] === '(') depth++
    else if (value[index] === ')') depth--
    index++
  }

  if (depth !== 0) return null

  const fileContent = value.substring(openParenIndex + 1, index - 1).trim()
  if (!fileContent) return null

  const parts = splitCsv(fileContent, undefined, { protectVariables: true })
  const filePath = trimSurroundingQuotes(parts[0].trim(), false)

  return {
    filePath,
    expression: value.slice(expressionStart, index),
    start: expressionStart,
    end: index,
  }
}

function extractDotenvPath(source) {
  const candidates = [
    source.relativePath,
    source.resolvedPath,
    source.filePath,
    source.fullFilePath,
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (isDotenvFilePath(candidate)) return candidate
  }

  const variableCandidates = [
    source.variable,
    source.variableString,
    source.originalVariableString,
    source.resolvedVariableString,
  ].filter(Boolean)

  for (const candidate of variableCandidates) {
    const extracted = extractFileExpression(String(candidate))
    if (extracted && isDotenvFilePath(extracted.filePath)) {
      return extracted.filePath
    }
  }

  return null
}

function getDotenvFileRefMetadata(source = {}) {
  const dotenvPath = extractDotenvPath(source)
  if (!dotenvPath) return null

  const scopeSource = source.variableString ||
    source.variable ||
    source.originalVariableString ||
    source.resolvedVariableString ||
    ''
  const accessorScope = hasFileAccessor(scopeSource) ? 'key' : null

  return {
    sensitive: true,
    sensitivityReason: DOTENV_SENSITIVITY_REASON,
    dotenvFile: true,
    dotenvReadScope: accessorScope || source.dotenvReadScope || 'full_file',
  }
}

function normalizeDotenvFileVariable(variableString) {
  const value = String(variableString || '')
  const expression = extractFileExpression(value)
  if (!expression || !isDotenvFilePath(expression.filePath)) return null

  const normalizedPath = normalizePath(expression.filePath) || expression.filePath
  const normalizedExpression = expression.expression.replace(/\(([\s\S]*)\)$/, `(${normalizedPath})`)
  const suffix = value.slice(expression.end).trim()
  const accessor = suffix.match(/^([:.][\w.[\]-]+)/)

  return accessor ? `${normalizedExpression}${accessor[1]}` : normalizedExpression
}

function isIniLikeFilePath(filePath) {
  const ext = path.extname(String(filePath || '')).slice(1).toLowerCase()
  return ext === 'ini' || isDotenvFilePath(filePath)
}

function applyDotenvFileRefMetadata(target, source) {
  const metadata = getDotenvFileRefMetadata(source)
  if (metadata) Object.assign(target, metadata)
  return target
}

module.exports = {
  DOTENV_SENSITIVITY_REASON,
  applyDotenvFileRefMetadata,
  getDotenvFileRefMetadata,
  hasFileAccessor,
  normalizeDotenvFileVariable,
  isDotenvFilePath,
  isIniLikeFilePath,
}
