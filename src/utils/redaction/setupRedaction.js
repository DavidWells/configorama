const dotProp = require('dot-prop')
const { REDACTED_VALUE, cloneJson } = require('./redact')

function inputSectionForRequirement(requirement) {
  if (!requirement) return null
  if (requirement.variableType === 'option') return 'options'
  if (requirement.variableType === 'env') return 'env'
  if (requirement.variableType === 'self') return 'self'
  if (requirement.variableType === 'dotProp') return 'dotProp'
  return null
}

function redactUserInputsByRequirements(userInputs, requirements) {
  const redacted = cloneJson(userInputs || {})

  for (const requirement of requirements || []) {
    if (!requirement || requirement.sensitive !== true) continue
    const section = inputSectionForRequirement(requirement)
    if (!section || !redacted[section]) continue
    if (Object.prototype.hasOwnProperty.call(redacted[section], requirement.name)) {
      redacted[section][requirement.name] = REDACTED_VALUE
    }
  }

  return redacted
}

function redactConfigByRequirements(config, requirements) {
  const redacted = cloneJson(config)

  for (const requirement of requirements || []) {
    if (!requirement || requirement.sensitive !== true) continue
    for (const configPath of requirement.paths || []) {
      if (configPath && dotProp.has(redacted, configPath)) {
        dotProp.set(redacted, configPath, REDACTED_VALUE)
      }
    }
  }

  return redacted
}

module.exports = {
  REDACTED_VALUE,
  redactConfigByRequirements,
  redactUserInputsByRequirements,
}
