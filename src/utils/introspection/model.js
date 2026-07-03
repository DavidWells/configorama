const path = require('path')
const { EXECUTABLE_EXTENSIONS } = require('../security/safetyPolicy')
const { redactRequirementValue } = require('../redaction/redact')
const { getDotenvFileRefMetadata } = require('../security/dotenvFileRefs')

const SCHEMA_VERSION = 1

function sortBy(keys) {
  return (a, b) => {
    for (const key of keys) {
      const av = a[key] === undefined || a[key] === null ? '' : String(a[key])
      const bv = b[key] === undefined || b[key] === null ? '' : String(b[key])
      if (av < bv) return -1
      if (av > bv) return 1
    }
    return 0
  }
}

function normalizeVariableType(type) {
  if (type === 'options' || type === 'opt') return 'option'
  if (type === 'dot.prop') return 'dotProp'
  if (type === 'if') return 'eval'
  return type || 'unknown'
}

function riskForVariable(variableType, variable) {
  const type = normalizeVariableType(variableType)
  if (type === 'eval') return 'data_flow_expression'
  if (type === 'git') return 'process_spawn'
  if (type === 'file' || type === 'text') {
    const match = String(variable || '').match(/^(?:file|text)\((.+?)\)/)
    const ext = match ? path.extname(match[1]).toLowerCase() : ''
    return EXECUTABLE_EXTENSIONS.has(ext) ? 'executable_code' : 'local_file_read'
  }
  return 'none'
}

function severityForRisk(risk) {
  if (risk === 'executable_code' || risk === 'custom_extension' || risk === 'environment_mutation') return 'high'
  if (risk === 'process_spawn') return 'medium'
  if (risk === 'local_file_read' || risk === 'data_flow_expression') return 'low'
  return 'info'
}

function severityForNode(risk, metadata) {
  if (metadata && metadata.dotenvFile && metadata.dotenvReadScope === 'full_file') return 'medium'
  return severityForRisk(risk)
}

function firstOccurrenceVariable(entry) {
  const occurrence = entry && Array.isArray(entry.occurrences) ? entry.occurrences[0] : null
  return occurrence ? (occurrence.varMatch || occurrence.originalString) : null
}

function assignSensitivity(target, metadata) {
  if (!metadata) return target
  if (metadata.sensitive === true) target.sensitive = true
  if (metadata.sensitivityReason) target.sensitivityReason = metadata.sensitivityReason
  if (metadata.dotenvFile !== undefined) target.dotenvFile = metadata.dotenvFile
  if (metadata.dotenvReadScope) target.dotenvReadScope = metadata.dotenvReadScope
  return target
}

function buildIntrospection(enrichedMetadata = {}, options = {}) {
  const uniqueVariables = enrichedMetadata.uniqueVariables || {}
  const requirements = options.requirements || []
  const requirementsByVariable = new Map(requirements.map(req => [req.variable, req]))
  const nodes = []
  const edges = []
  const diagnostics = []

  for (const [key, entry] of Object.entries(uniqueVariables).sort(([a], [b]) => a.localeCompare(b))) {
    const variable = entry.variable || key
    const variableType = normalizeVariableType(entry.variableType)
    const requirement = requirementsByVariable.get(variable)
    const risk = riskForVariable(variableType, variable)
    const dotenvMetadata = getDotenvFileRefMetadata({
      ...entry,
      variable,
      originalVariableString: firstOccurrenceVariable(entry),
    })
    const node = {
      id: `variable:${variable}`,
      kind: variableType === 'file' || variableType === 'text'
        ? 'file'
        : (risk === 'executable_code' ? 'executable' : 'variable'),
      variable,
      variableType,
      sourceClass: entry.variableSourceType || entry.sourceClass || requirement?.sourceClass || null,
      risk,
      severity: severityForNode(risk, dotenvMetadata || entry),
      paths: [...new Set((entry.occurrences || []).map(occ => occ.path).filter(Boolean))].sort(),
      sensitive: requirement ? requirement.sensitive === true : entry.sensitive === true,
    }
    assignSensitivity(node, dotenvMetadata || entry)
    if (requirement) {
      node.required = requirement.required
      node.default = redactRequirementValue(requirement, requirement.default)
      node.description = requirement.description
    }
    nodes.push(node)

    for (const configPath of node.paths) {
      edges.push({
        from: `configPath:${configPath}`,
        to: node.id,
        kind: 'uses',
      })
    }

    for (const inner of entry.innerVariables || []) {
      edges.push({
        from: node.id,
        to: `variable:${inner.variable}`,
        kind: 'depends_on',
      })
    }

    if ((variableType === 'file' || variableType === 'text') && String(variable).includes('${')) {
      diagnostics.push({
        code: 'dynamic_file_target',
        severity: 'info',
        variable,
        message: 'File target contains variables; static introspection records a partial edge.',
      })
    }
  }

  const fileDeps = enrichedMetadata.fileDependencies || {}
  for (const dep of fileDeps.byConfigPath || []) {
    const id = `file:${dep.relativePath || dep.filePath}`
    const dotenvMetadata = getDotenvFileRefMetadata(dep)
    const risk = EXECUTABLE_EXTENSIONS.has(path.extname(dep.relativePath || dep.filePath || '').toLowerCase()) ? 'executable_code' : 'local_file_read'
    if (!nodes.some(node => node.id === id)) {
      const node = {
        id,
        kind: EXECUTABLE_EXTENSIONS.has(path.extname(dep.relativePath || dep.filePath || '').toLowerCase()) ? 'executable' : 'file',
        path: dep.filePath,
        relativePath: dep.relativePath,
        exists: dep.exists,
        risk,
        severity: severityForNode(risk, dotenvMetadata || dep),
      }
      assignSensitivity(node, dotenvMetadata || dep)
      nodes.push(node)
    }
    if (dep.location) {
      edges.push({
        from: `configPath:${dep.location}`,
        to: id,
        kind: 'reads',
      })
    }
  }

  nodes.sort(sortBy(['kind', 'id']))
  edges.sort(sortBy(['from', 'kind', 'to']))
  diagnostics.sort(sortBy(['code', 'variable']))

  return {
    schemaVersion: SCHEMA_VERSION,
    nodes,
    edges,
    diagnostics,
    summary: {
      nodes: nodes.length,
      edges: edges.length,
      diagnostics: diagnostics.length,
    }
  }
}

module.exports = {
  SCHEMA_VERSION,
  buildIntrospection,
  normalizeVariableType,
  riskForVariable,
  severityForRisk,
}
