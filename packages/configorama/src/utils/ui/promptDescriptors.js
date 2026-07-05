function stripPromptQuotes(value) {
  if (typeof value !== 'string') return value
  const match = value.match(/^(['"])([\s\S]*)\1$/)
  return match ? match[2] : value
}

function getSourceGroup(requirement) {
  if (requirement.variableType === 'option') return 'options'
  if (requirement.variableType === 'env') return 'env'
  if (requirement.variableType === 'self') return 'self'
  if (requirement.variableType === 'dotProp') return 'dotProp'
  if (requirement.variableType === 'file' || requirement.variableType === 'text') return 'files'
  return 'other'
}

function getRequirementGroup(requirement) {
  return requirement.group || getSourceGroup(requirement)
}

function groupRequirementsForWizard(requirements) {
  const grouped = {
    options: [],
    env: [],
    self: [],
    dotProp: [],
    files: [],
    other: [],
  }

  for (const requirement of requirements || []) {
    const group = getRequirementGroup(requirement)
    if (!grouped[group]) grouped[group] = []
    grouped[group].push(requirement)
  }

  return grouped
}

function selectPromptType(requirement) {
  if (requirement.sensitive) return 'password'
  if (requirement.allowedValues && requirement.allowedValues.length) {
    return requirement.type === 'array' ? 'multiselect' : 'select'
  }
  if (requirement.type === 'boolean') return 'confirm'
  return 'text'
}

function getPromptDefault(requirement) {
  if (requirement.variableType === 'env' && process.env[requirement.name] !== undefined) {
    return process.env[requirement.name]
  }
  return stripPromptQuotes(requirement.default)
}

function getPromptPlaceholder(requirement) {
  const defaultValue = getPromptDefault(requirement)
  if (defaultValue !== null && defaultValue !== undefined && defaultValue !== '') {
    return String(defaultValue)
  }
  if (requirement.variableType === 'option') return `Enter value for --${requirement.name}`
  if (requirement.variableType === 'env') return `Enter environment variable for ${requirement.name}`
  if (requirement.variableType === 'file' || requirement.variableType === 'text') return requirement.name
  return `Enter value for ${requirement.name}`
}

function getConflictWarning(requirement) {
  if (!requirement.conflicts || requirement.conflicts.length === 0) return null
  return requirement.conflicts.map(conflict => {
    const paths = conflict.paths && conflict.paths.length ? conflict.paths.join(', ') : 'unknown path'
    return `${conflict.field} conflict at ${paths}`
  }).join('; ')
}

function validatePromptValue(value, descriptor) {
  if ((value === undefined || value === null || value === '') && descriptor.required) {
    return 'This value is required'
  }
  if (value === undefined || value === null || value === '') return undefined

  if (descriptor.allowedValues && descriptor.allowedValues.length && descriptor.promptType !== 'multiselect') {
    if (!descriptor.allowedValues.map(String).includes(String(value))) {
      return `Must be one of: ${descriptor.allowedValues.join(', ')}`
    }
  }

  switch (descriptor.type) {
    case 'number':
      if (Number.isNaN(Number(value))) return 'Must be a valid number'
      return undefined
    case 'boolean':
      if (typeof value === 'boolean') return undefined
      if (!['true', 'false', 'yes', 'no', 'on', 'off', '1', '0'].includes(String(value).toLowerCase())) {
        return 'Must be a boolean value'
      }
      return undefined
    case 'json':
    case 'object':
      if (typeof value === 'object') return undefined
      try {
        const parsed = JSON.parse(value)
        if (descriptor.type === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
          return 'Must be a valid JSON object'
        }
        return undefined
      } catch (error) {
        return 'Must be valid JSON'
      }
    case 'array':
      if (Array.isArray(value)) return undefined
      if (typeof value !== 'string') return 'Must be a comma-separated list or JSON array'
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) return undefined
        return 'Must be a JSON array'
      } catch (error) {
        return value.includes(',') ? undefined : 'Must be a comma-separated list or JSON array'
      }
    default:
      return undefined
  }
}

function normalizePromptValue(value, descriptor) {
  const input = value === undefined || value === '' ? descriptor.defaultValue : value
  const cleaned = stripPromptQuotes(input)
  if (cleaned === undefined || cleaned === null) return cleaned

  switch (descriptor.type) {
    case 'number':
      return Number(cleaned)
    case 'boolean':
      if (typeof cleaned === 'boolean') return cleaned
      return ['true', 'yes', 'on', '1'].includes(String(cleaned).toLowerCase())
    case 'array':
      if (Array.isArray(cleaned)) return cleaned
      return String(cleaned).split(',').map(item => item.trim()).filter(Boolean)
    case 'json':
    case 'object':
      return typeof cleaned === 'object' ? cleaned : JSON.parse(cleaned)
    default:
      return cleaned
  }
}

function createPromptDescriptor(requirement) {
  const defaultValue = getPromptDefault(requirement)
  const promptType = selectPromptType(requirement)

  return {
    name: requirement.name,
    variable: requirement.variable,
    variableType: requirement.variableType,
    group: getRequirementGroup(requirement),
    promptType,
    type: requirement.type || 'string',
    required: Boolean(requirement.required),
    sensitive: Boolean(requirement.sensitive),
    description: requirement.description || null,
    obtainHint: requirement.obtainHint || null,
    examples: requirement.examples || null,
    defaultHint: requirement.defaultHint || null,
    deprecationMessage: requirement.deprecationMessage || null,
    defaultValue,
    placeholder: getPromptPlaceholder(requirement),
    allowedValues: requirement.allowedValues || null,
    paths: requirement.paths || [],
    occurrences: requirement.occurrences || [],
    conflicts: requirement.conflicts || [],
    conflictWarning: getConflictWarning(requirement),
    normalize: value => normalizePromptValue(value, {
      type: requirement.type || 'string',
      defaultValue,
    }),
    validate: value => validatePromptValue(value, {
      promptType,
      type: requirement.type || 'string',
      required: Boolean(requirement.required),
      allowedValues: requirement.allowedValues || null,
    }),
  }
}

function createPromptDescriptors(requirements) {
  return (requirements || []).map(createPromptDescriptor)
}

module.exports = {
  createPromptDescriptor,
  createPromptDescriptors,
  getRequirementGroup,
  groupRequirementsForWizard,
  normalizePromptValue,
  selectPromptType,
  stripPromptQuotes,
  validatePromptValue,
}
