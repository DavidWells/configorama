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
    findings.push({
      id: node.id,
      severity: node.severity || severityForRisk(node.risk),
      risk: node.risk,
      kind: node.kind,
      variable: node.variable,
      path: node.path,
      relativePath: node.relativePath,
      configPaths: node.paths || [],
      message: messageForNode(node),
    })
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
    for (const resolver of options.customResolvers.slice().sort()) {
      findings.push({
        id: `customResolver:${resolver}`,
        severity: 'high',
        risk: 'custom_extension',
        kind: 'source',
        variableType: resolver,
        message: `Custom resolver "${resolver}" can execute user-provided code.`,
      })
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

function messageForNode(node) {
  if (node.risk === 'executable_code') return 'Reference may execute JavaScript or TypeScript.'
  if (node.risk === 'process_spawn') return 'Reference may spawn a git process.'
  if (node.risk === 'local_file_read') return 'Reference reads a local file.'
  if (node.risk === 'data_flow_expression') return 'Expression can read resolved config values but is not JavaScript execution.'
  return `Risk surface: ${node.risk}`
}

module.exports = {
  buildAuditReport,
}
