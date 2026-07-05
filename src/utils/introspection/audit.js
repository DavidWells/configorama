const { severityForRisk } = require('./model')

function sortFindings(a, b) {
  const severityOrder = { high: 0, medium: 1, low: 2, info: 3 }
  const severityDiff = (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99)
  if (severityDiff !== 0) return severityDiff
  return String(a.id).localeCompare(String(b.id))
}

function buildAuditReport(introspection, options = {}) {
  const findings = []

  for (const node of introspection.nodes || []) {
    if (!node.risk || node.risk === 'none') continue
    const finding = {
      id: node.id,
      severity: node.severity || severityForRisk(node.risk),
      risk: node.risk,
      kind: node.kind,
      variable: node.variable,
      path: node.path,
      relativePath: node.relativePath,
      configPaths: node.paths || [],
      message: messageForNode(node),
    }
    if (node.sensitive === true) finding.sensitive = true
    if (node.sensitivityReason) finding.sensitivityReason = node.sensitivityReason
    if (node.dotenvFile !== undefined) finding.dotenvFile = node.dotenvFile
    if (node.dotenvReadScope) finding.dotenvReadScope = node.dotenvReadScope
    findings.push(finding)
  }

  if (options.dotenv === true) {
    findings.push({
      id: 'dotenv:useDotenv',
      severity: 'high',
      risk: 'environment_mutation',
      kind: 'source',
      message: 'Configuration requests dotenv loading, which mutates process.env.',
    })
  }

  if (options.customResolvers && options.customResolvers.length) {
    const sorted = options.customResolvers.slice().sort((a, b) => {
      return String(a.type || a).localeCompare(String(b.type || b))
    })
    for (const resolver of sorted) {
      findings.push(customResolverFinding(resolver))
    }
  }

  findings.sort(sortFindings)

  return {
    schemaVersion: 1,
    safeMode: options.safeMode === true,
    findings,
    diagnostics: introspection.diagnostics || [],
    summary: {
      high: findings.filter(finding => finding.severity === 'high').length,
      medium: findings.filter(finding => finding.severity === 'medium').length,
      low: findings.filter(finding => finding.severity === 'low').length,
      info: findings.filter(finding => finding.severity === 'info').length,
      total: findings.length,
    }
  }
}

/**
 * Build the audit finding for one custom resolver.
 * Resolvers that self-describe as sensitive/risky get a specific finding
 * instead of the generic custom_extension one - never both.
 * @param {string|{type: string, sensitive?: boolean, risk?: string, description?: string}} resolver
 * @returns {object} Audit finding
 */
function customResolverFinding(resolver) {
  const source = typeof resolver === 'string' ? { type: resolver } : resolver
  const { type, sensitive, risk, description } = source

  if (sensitive === true || risk) {
    const finding = {
      id: `customResolver:${type}`,
      severity: 'high',
      risk: risk || 'custom_extension',
      kind: 'source',
      variableType: type,
      message: `Custom resolver "${type}" reads secret values.${description ? ` ${description}.` : ''}`,
    }
    if (sensitive === true) finding.sensitive = true
    return finding
  }

  return {
    id: `customResolver:${type}`,
    severity: 'high',
    risk: 'custom_extension',
    kind: 'source',
    variableType: type,
    message: `Custom resolver "${type}" can execute user-provided code.`,
  }
}

function messageForNode(node) {
  if (node.risk === 'executable_code') return 'Reference may execute JavaScript or TypeScript.'
  if (node.risk === 'process_spawn') return 'Reference may spawn a git process.'
  if (node.sensitivityReason === 'dotenv_file' && node.dotenvReadScope === 'full_file') return 'Reference reads an entire dotenv file; resolved output may contain secrets.'
  if (node.sensitivityReason === 'dotenv_file') return 'Reference reads a key from a dotenv file.'
  if (node.risk === 'local_file_read') return 'Reference reads a local file.'
  if (node.risk === 'data_flow_expression') return 'Expression can read resolved config values but is not JavaScript execution.'
  return `Risk surface: ${node.risk}`
}

module.exports = {
  buildAuditReport,
}
