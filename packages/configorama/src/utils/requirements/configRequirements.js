const { isSensitiveVariable } = require('../redaction/redact')

const TYPE_MAP = {
  Boolean: 'boolean',
  String: 'string',
  Number: 'number',
  Array: 'array',
  Object: 'object',
  Json: 'json',
}

const VARIABLE_TYPE_MAP = {
  options: 'option',
  opt: 'option',
  option: 'option',
  'dot.prop': 'dotProp',
  dotProp: 'dotProp',
  if: 'eval',
}

function normalizeVariableType(variableType) {
  return VARIABLE_TYPE_MAP[variableType] || variableType || 'unknown'
}

function normalizeType(type) {
  if (!type) return 'string'
  return TYPE_MAP[type] || String(type).toLowerCase()
}

function cleanDefaultValue(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return value
  const match = value.match(/^(['"])([\s\S]*)\1$/)
  return match ? match[2] : value
}

function unique(values) {
  return [...new Set(values.filter(value => value !== undefined && value !== null))]
}

function uniqueBy(values, getKey) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const key = getKey(value)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function firstValue(values) {
  return values.find(value => value !== undefined && value !== null)
}

function getRequirementName(variable, variableType) {
  const normalizedType = normalizeVariableType(variableType)
  if (!variable) return ''

  if (normalizedType === 'option') return variable.replace(/^(opt|option|options):/, '')
  if (normalizedType === 'env') return variable.replace(/^env:/, '')
  if (normalizedType === 'param') return variable.replace(/^param:/, '')
  if (normalizedType === 'self') return variable.replace(/^self:/, '')
  if (normalizedType === 'file' || normalizedType === 'text') {
    const match = variable.match(/^(?:file|text)\((.+?)\)/)
    return match ? match[1] : variable
  }
  return variable
}

function getOccurrenceTypes(occurrences) {
  return unique((occurrences || []).map(occ => occ.type))
}

function getOccurrenceTypeEntries(occurrences) {
  return (occurrences || [])
    .filter(occ => occ.type)
    .map(occ => ({
      value: normalizeType(occ.type),
      path: occ.path,
    }))
}

function getDescriptionCandidates(entry, occurrences) {
  const candidates = []
  if (entry.description) {
    candidates.push({
      value: entry.description,
      source: entry.descriptionSource || 'help',
      path: null,
      index: candidates.length,
    })
  }
  for (const occ of occurrences || []) {
    if (!occ.description) continue
    candidates.push({
      value: occ.description,
      source: occ.descriptionSource || 'help',
      path: occ.path,
      index: candidates.length,
    })
  }
  if (entry.descriptions && entry.descriptions.length) {
    const occurrenceDescriptions = new Set(candidates.map(candidate => candidate.value))
    for (const description of entry.descriptions) {
      if (occurrenceDescriptions.has(description)) continue
      candidates.push({
        value: description,
        source: 'help',
        path: null,
        index: candidates.length,
      })
    }
  }
  return uniqueBy(candidates, candidate => `${candidate.source}:${candidate.value}:${candidate.path || ''}`)
}

function getDescriptionPriority(source) {
  if (source === 'commentTag') return -1
  if (source === 'help') return 0
  if (source === 'inlineComment' || source === 'comment') return 1
  if (source === 'leadingComment') return 2
  return 3
}

function selectDescription(candidates) {
  const sorted = [...candidates].sort((a, b) => {
    const priority = getDescriptionPriority(a.source) - getDescriptionPriority(b.source)
    if (priority !== 0) return priority
    return a.index - b.index
  })
  return sorted[0] || null
}

function getOccurrenceDefaults(entry, occurrences) {
  const defaults = (occurrences || []).map(occ => occ.defaultValue)
  if (entry.resolvedValue !== undefined) defaults.push(entry.resolvedValue)
  return defaults
}

function getOccurrenceDefaultEntries(entry, occurrences) {
  const entries = (occurrences || [])
    .filter(occ => occ.defaultValue !== undefined && occ.defaultValue !== null)
    .map(occ => ({
      value: cleanDefaultValue(occ.defaultValue),
      path: occ.path,
    }))
  if (entry.resolvedValue !== undefined && entry.resolvedValue !== null) {
    entries.push({
      value: cleanDefaultValue(entry.resolvedValue),
      path: null,
    })
  }
  return entries
}

function getAllowedValues(entry, occurrences) {
  if (entry.allowedValues) return entry.allowedValues
  const values = (occurrences || []).flatMap(occ => occ.allowedValues || [])
  return values.length ? unique(values).map(String) : null
}

function collectFieldEntries(entry, occurrences, field) {
  const entries = []
  if (entry[field] !== undefined && entry[field] !== null) {
    entries.push({
      value: entry[field],
      path: null,
    })
  }
  for (const occ of occurrences || []) {
    if (occ[field] === undefined || occ[field] === null) continue
    entries.push({
      value: occ[field],
      path: occ.path,
    })
  }
  return entries
}

function selectFieldValue(entries) {
  const entry = (entries || []).find(item => item.value !== undefined && item.value !== null)
  return entry ? entry.value : null
}

function mergeExamples(entry, occurrences) {
  const values = []
  if (entry.examples) values.push(...entry.examples)
  for (const occ of occurrences || []) {
    if (occ.examples) values.push(...occ.examples)
  }
  const merged = unique(values.map(String))
  return merged.length ? merged : null
}

function collectScalarAnnotationConflicts(fieldEntriesByField) {
  const conflicts = []
  for (const [field, entries] of Object.entries(fieldEntriesByField)) {
    const uniqueEntries = uniqueBy(entries, entry => String(entry.value))
    if (uniqueEntries.length > 1) {
      conflicts.push(makeConflict(field, uniqueEntries))
    }
  }
  return conflicts
}

function normalizeAllowedSet(values) {
  return (values || []).map(String).sort()
}

function allowedSetKey(values) {
  return JSON.stringify(normalizeAllowedSet(values))
}

function collectAllowedSets(entry, occurrences) {
  const sets = []
  if (entry.allowedValues) {
    sets.push({ values: entry.allowedValues, path: null })
  }
  for (const occ of occurrences || []) {
    if (occ.allowedValues) {
      sets.push({ values: occ.allowedValues, path: occ.path })
    }
  }
  return sets
}

function getSourceClass(entry) {
  return entry.variableSourceType || entry.sourceClass || null
}

function makeConflict(field, values) {
  return {
    field,
    values,
    paths: unique(values.flatMap(value => value.paths || (value.path ? [value.path] : []))),
  }
}

function collectConflicts({ typeEntries, defaultEntries, allowedSets, scalarAnnotationEntries = {} }) {
  const conflicts = []

  const typedValues = uniqueBy(typeEntries, entry => entry.value)
  if (typedValues.length > 1) {
    conflicts.push(makeConflict('type', typedValues))
  }

  const defaultValues = uniqueBy(defaultEntries.filter(entry => entry.value !== null), entry => String(entry.value))
  if (defaultValues.length > 1) {
    conflicts.push(makeConflict('default', defaultValues))
  }

  const uniqueAllowedSets = uniqueBy(allowedSets, set => allowedSetKey(set.values))
  if (uniqueAllowedSets.length > 1) {
    conflicts.push(makeConflict('allowedValues', uniqueAllowedSets.map(set => ({
      value: normalizeAllowedSet(set.values),
      path: set.path,
    }))))
  }

  conflicts.push(...collectScalarAnnotationConflicts(scalarAnnotationEntries))

  return conflicts
}

function getSensitiveValue(name, sensitiveEntries) {
  return isSensitiveVariable(name, { sensitiveEntries })
}

function buildRequirement(varKey, entry) {
  const occurrences = entry.occurrences || []
  const variableType = normalizeVariableType(entry.variableType)
  const name = getRequirementName(entry.variable || varKey, entry.variableType)
  const types = getOccurrenceTypes(occurrences)
  const typeEntries = getOccurrenceTypeEntries(occurrences)
  const descriptionCandidates = getDescriptionCandidates(entry, occurrences)
  const selectedDescription = selectDescription(descriptionCandidates)
  const defaults = getOccurrenceDefaults(entry, occurrences)
  const defaultEntries = getOccurrenceDefaultEntries(entry, occurrences)
  const defaultValue = cleanDefaultValue(firstValue(defaults))
  const allowedSets = collectAllowedSets(entry, occurrences)
  const obtainHintEntries = collectFieldEntries(entry, occurrences, 'obtainHint')
  const defaultHintEntries = collectFieldEntries(entry, occurrences, 'defaultHint')
  const groupEntries = collectFieldEntries(entry, occurrences, 'group')
  const deprecationEntries = collectFieldEntries(entry, occurrences, 'deprecationMessage')
  const sensitiveEntries = collectFieldEntries(entry, occurrences, 'sensitive')
  const conflicts = collectConflicts({
    typeEntries,
    defaultEntries,
    allowedSets,
    scalarAnnotationEntries: {
      obtainHint: obtainHintEntries,
      defaultHint: defaultHintEntries,
      group: groupEntries,
      deprecationMessage: deprecationEntries,
      sensitive: sensitiveEntries,
    },
  })
  const obtainHint = selectFieldValue(obtainHintEntries)
  const defaultHint = selectFieldValue(defaultHintEntries)
  const group = selectFieldValue(groupEntries)
  const deprecationMessage = selectFieldValue(deprecationEntries)
  const sensitive = getSensitiveValue(name, sensitiveEntries)
  const sensitiveSource = sensitiveEntries.length ? 'commentTag' : null

  const paths = unique(occurrences.map(occ => occ.path))
  const required = occurrences.some(occ => occ.isRequired === true) && defaultValue === null
  const description = selectedDescription ? selectedDescription.value : null

  return {
    name,
    variable: entry.variable || varKey,
    variableType,
    sourceClass: getSourceClass(entry),
    type: normalizeType(firstValue(types)),
    description,
    descriptionSource: selectedDescription ? selectedDescription.source : null,
    allowedValues: getAllowedValues(entry, occurrences),
    sensitive,
    sensitiveSource,
    required,
    default: defaultValue,
    defaultHint,
    obtainHint,
    examples: mergeExamples(entry, occurrences),
    group,
    deprecationMessage,
    fileExists: entry.fileExists,
    innerVariables: entry.innerVariables || [],
    paths,
    conflicts,
    occurrences,
  }
}

function buildConfigRequirements(analysis) {
  const uniqueVariables = analysis && analysis.uniqueVariables ? analysis.uniqueVariables : {}
  return Object.entries(uniqueVariables).map(([varKey, entry]) => {
    return buildRequirement(varKey, entry)
  })
}

module.exports = {
  buildConfigRequirements,
  buildRequirement,
  cleanDefaultValue,
  collectConflicts,
  normalizeType,
  normalizeVariableType,
}
