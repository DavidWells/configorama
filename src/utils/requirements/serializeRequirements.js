const { buildConfigRequirements } = require('./configRequirements')

const READONLY_VARIABLE_TYPES = new Set([
  'cron',
  'eval',
  'git',
  'self',
  'dotProp',
])

function getConfigIdentity(analysis, configPathOrObject) {
  if (typeof configPathOrObject === 'string') return configPathOrObject
  if (analysis && analysis.configFilePath) return analysis.configFilePath
  return null
}

function getSummary(requirements) {
  return {
    total: requirements.length,
    required: requirements.filter(req => req.required).length,
    optional: requirements.filter(req => !req.required).length,
    sensitive: requirements.filter(req => req.sensitive).length,
  }
}

function isDynamicFileRequirement(requirement) {
  const target = requirement.name || requirement.variable || ''
  if (target.includes('${')) return true
  return (requirement.innerVariables || []).length > 0
}

function isMissingConcreteFileRequirement(requirement) {
  if (requirement.variableType !== 'file' && requirement.variableType !== 'text') return false
  if (isDynamicFileRequirement(requirement)) return false
  return requirement.fileExists !== true
}

function getHow(requirement) {
  switch (requirement.variableType) {
    case 'env':
      return `Set environment variable ${requirement.name}`
    case 'option':
      return `Pass --${requirement.name} on the CLI`
    case 'param':
      return `Pass --param ${requirement.name}=<value>`
    case 'file':
      return `Provide file at path ${requirement.name}`
    case 'text':
      return `Provide text file at path ${requirement.name}`
    default:
      return null
  }
}

function shouldAsk(requirement) {
  if (isMissingConcreteFileRequirement(requirement)) return true
  if (READONLY_VARIABLE_TYPES.has(requirement.variableType)) return false
  return Boolean(
    requirement.required &&
    requirement.default === null &&
    requirement.sourceClass === 'user'
  )
}

function toAskItem(requirement) {
  return {
    name: requirement.name,
    variable: requirement.variable,
    variableType: requirement.variableType,
    type: requirement.type,
    sensitive: requirement.sensitive,
    description: requirement.description,
    obtainHint: requirement.obtainHint,
    examples: requirement.examples,
    defaultHint: requirement.defaultHint,
    group: requirement.group,
    deprecationMessage: requirement.deprecationMessage,
    paths: requirement.paths,
    how: getHow(requirement),
  }
}

function formatConflictError(requirements) {
  const conflicted = requirements.filter(req => req.conflicts && req.conflicts.length)
  if (!conflicted.length) return null

  const details = conflicted.flatMap(req => {
    return req.conflicts.map(conflict => {
      const paths = conflict.paths && conflict.paths.length ? conflict.paths.join(', ') : 'unknown path'
      const values = conflict.values.map(value => JSON.stringify(value.value)).join(', ')
      return `${req.variable} ${conflict.field} conflict at ${paths}: ${values}`
    })
  })

  return new Error(`Config requirements contain conflicting annotations:\n${details.join('\n')}`)
}

function serializeRequirements(analysis, options = {}) {
  const requirements = buildConfigRequirements(analysis)
  const conflictError = formatConflictError(requirements)
  if (conflictError) throw conflictError

  return {
    schemaVersion: 1,
    config: getConfigIdentity(analysis, options.configPathOrObject),
    summary: getSummary(requirements),
    requirements,
    ask: requirements
      .filter(shouldAsk)
      .map(toAskItem),
  }
}

module.exports = {
  getHow,
  getSummary,
  isMissingConcreteFileRequirement,
  serializeRequirements,
  shouldAsk,
}
