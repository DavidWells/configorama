// Wizard to prompt user through config setup
const p = require('@clack/prompts')
const chalk = require('./chalk')
const dotProp = require('dot-prop')
const fs = require('fs')
const path = require('path')

/**
 * Groups variables by type for wizard flow
 * @param {object} uniqueVariables - The uniqueVariables from enriched metadata
 * @param {object} originalConfig - The original config before resolution
 * @returns {object} Grouped variables by type
 */
function groupVariablesByType(uniqueVariables, originalConfig = {}) {
  const grouped = {
    options: [],
    env: [],
    self: [],
  }

  // Track variables we've already added to avoid duplicates
  const addedVars = new Set()

  for (const [varKey, varData] of Object.entries(uniqueVariables)) {
    const { variable, variableType, isRequired, defaultValue, defaultValueSrc, occurrences, innerVariables, hasValue } = varData

    // Handle top-level variables (not file/text types)
    if (variableType !== 'file' && variableType !== 'text') {
      // Skip if has a value (for self refs and dot.prop)
      if (hasValue === true) {
        continue
      }

      // For self/dot.prop refs, skip if they have a defaultValueSrc (means they have a static value in config)
      if ((variableType === 'self' || variableType === 'dot.prop') && defaultValueSrc) {
        continue
      }

      // For self/dot.prop refs, skip if ANY occurrence has a fallback
      // This means the variable has a fallback chain and will resolve naturally
      if (variableType === 'self' || variableType === 'dot.prop') {
        const hasAnyFallback = occurrences.some(occ => occ.hasFallback)
        if (hasAnyFallback) {
          continue
        }

        // Skip if this variable only appears as part of another variable's fallback chain
        // (i.e., appears in 'value' field but not as 'originalString')
        const isOnlyFallback = occurrences.every(occ => {
          // If it has originalString, it's a top-level variable
          if (occ.originalString) return false
          // If it appears in a 'value' field, it's part of a fallback chain
          if (occ.value && occ.value.includes(',')) return true
          return false
        })
        if (isOnlyFallback) {
          continue
        }

        // Skip if the variable path itself contains unresolved variables
        // e.g., self:stages.${opt:stage}.SECRET - can't set this in config because path is dynamic
        const cleanPath = variable.replace(/^self:/, '')
        if (cleanPath.includes('${')) {
          continue
        }

        // Also check if value exists in original config
        const configValue = dotProp.get(originalConfig, cleanPath)
        if (configValue !== undefined) {
          // Value exists in config, skip prompting
          continue
        }
      }

      const cleanName = variable.replace(/^(opt|env|self):/, '')

      if (!addedVars.has(variable)) {
        addedVars.add(variable)

        // Check if ANY occurrence is required without fallback
        const hasRequiredOccurrence = occurrences.some(occ => occ.isRequired && !occ.hasFallback)

        // Check if ANY occurrence has a default/fallback value
        const fallbackOccurrence = occurrences.find(occ => occ.hasFallback && occ.defaultValue)
        const availableDefault = fallbackOccurrence?.defaultValue || defaultValue

        const varInfo = {
          key: varKey,
          variable,
          cleanName,
          variableType,
          isRequired: hasRequiredOccurrence,
          defaultValue: availableDefault,
          hasFallback: !!availableDefault,
          occurrences: occurrences || [],
        }

        if (variableType === 'options') {
          grouped.options.push(varInfo)
        } else if (variableType === 'env') {
          grouped.env.push(varInfo)
        } else if (variableType === 'self') {
          grouped.self.push(varInfo)
        }
      }
    }

    // Extract inner variables from file/text references
    if (innerVariables && Array.isArray(innerVariables)) {
      for (const innerVar of innerVariables) {
        // Skip if already has a value
        if (innerVar.hasValue) {
          continue
        }

        // Skip if not required
        if (!innerVar.isRequired) {
          continue
        }

        const cleanName = innerVar.variable.replace(/^(opt|env|self):/, '')

        // If already added, append this occurrence to existing variable
        const existingVarIndex = grouped[innerVar.variableType === 'options' ? 'options' : innerVar.variableType === 'env' ? 'env' : 'self']
          .findIndex(v => v.variable === innerVar.variable)

        if (existingVarIndex >= 0) {
          // Add this occurrence to the existing variable
          const varList = innerVar.variableType === 'options' ? grouped.options : innerVar.variableType === 'env' ? grouped.env : grouped.self
          const existingVar = varList[existingVarIndex]

          // Add occurrence from parent file variable
          if (occurrences && occurrences.length > 0) {
            existingVar.occurrences.push(...occurrences)
          }
          continue
        }

        // Skip if already added to the set
        if (addedVars.has(innerVar.variable)) {
          continue
        }

        addedVars.add(innerVar.variable)

        const varInfo = {
          key: innerVar.variable,
          variable: innerVar.variable,
          cleanName,
          variableType: innerVar.variableType,
          isRequired: innerVar.isRequired,
          defaultValue: innerVar.defaultValue,
          occurrences: occurrences ? [...occurrences] : [], // Use parent file variable occurrences
        }

        if (innerVar.variableType === 'options') {
          grouped.options.push(varInfo)
        } else if (innerVar.variableType === 'env') {
          grouped.env.push(varInfo)
        } else if (innerVar.variableType === 'self') {
          grouped.self.push(varInfo)
        }
      }
    }
  }

  return grouped
}

/**
 * Detects if a variable name suggests sensitive data
 * @param {string} name - Variable name
 * @returns {boolean} True if likely sensitive
 */
function isSensitiveVariable(name) {
  const sensitivePatterns = [
    /secret/i,
    /password/i,
    /token/i,
    /key/i,
    /credential/i,
    /auth/i,
  ]
  return sensitivePatterns.some(pattern => pattern.test(name))
}

/**
 * Creates a human-readable prompt message
 * @param {object} varInfo - Variable info
 * @returns {string} Prompt message
 */
function createPromptMessage(varInfo) {
  const { cleanName, variableType, occurrences } = varInfo

  let typeLabel
  if (variableType === 'options') {
    typeLabel = 'Flag'
  } else if (variableType === 'env') {
    typeLabel = 'Env'
  } else if (variableType === 'self') {
    typeLabel = 'Config'
  } else {
    typeLabel = 'Value'
  }

  // Build context from all occurrences
  let contextHint = ''

  if (occurrences && occurrences.length > 0) {
    // Parse occurrences into key-value pairs
    const parsedOccurrences = occurrences.map(occ => {
      const keyPath = occ.path
      const originalValue = occ.value || occ.originalString || occ.fullMatch

      if (keyPath && originalValue) {
        return { key: keyPath, value: originalValue }
      } else if (keyPath) {
        return { key: keyPath, value: '' }
      }
      return null
    }).filter(Boolean)

    if (parsedOccurrences.length > 0) {
      // Get the variable reference syntax
      const varPrefix = variableType === 'options' ? 'opt' : variableType === 'env' ? 'env' : 'self'
      const varSyntax = `\${${varPrefix}:${cleanName}}`

      // Show variable syntax and count
      contextHint = ` - ${varSyntax} - Used in ${parsedOccurrences.length} ${parsedOccurrences.length === 1 ? 'place' : 'places'}`

      // Find longest key for alignment
      const maxKeyLength = Math.max(...parsedOccurrences.map(o => o.key.length))

      // List all occurrences with bullets and aligned values (using invisible unicode for indentation)
      const indent = '\u2800\u2800\u2800' // Braille blank pattern (invisible but not stripped)
      const usageList = parsedOccurrences.map(({ key, value }, index) => {
        const padding = ' '.repeat(maxKeyLength - key.length)
        const leadingEmptyLine = index === 0 ? '│\n' : ''
        return value ? `${leadingEmptyLine}│${indent}- ${key}:${padding}    ${value}` : `${leadingEmptyLine}│${indent}• ${key}`
      })
      contextHint += '\n' + usageList.join('\n') + '\n│'
    }
  }

  const message = `[${typeLabel}] ${cleanName}${contextHint}`

  return message
}

/**
 * Runs config setup wizard
 * @param {object} metadata - Enriched metadata from configorama
 * @param {object} originalConfig - The original config before resolution
 * @returns {Promise<object>} User inputs by variable type
 */
async function runConfigWizard(metadata, originalConfig = {}) {
  const { uniqueVariables } = metadata

  if (!uniqueVariables || Object.keys(uniqueVariables).length === 0) {
    p.intro(chalk.cyan('Configuration Wizard'))
    p.outro('No variables found that require setup.')
    return {}
  }

  const grouped = groupVariablesByType(uniqueVariables, originalConfig)
  const totalVars = grouped.options.length + grouped.env.length + grouped.self.length

  if (totalVars === 0) {
    p.intro(chalk.cyan('Configuration Wizard'))
    p.outro('No variables found that require setup.')
    return {}
  }

  p.intro(chalk.cyan('Configuration Wizard'))

  const userInputs = {
    options: {},
    env: {},
    self: {},
  }

  // Prompt for options (CLI flags)
  if (grouped.options.length > 0) {
    const flagsList = grouped.options.map(v => {
      const varSyntax = `\${opt:${v.cleanName}}`
      return `  - ${varSyntax}`
    }).join('\n')
    const noteContent = `Found ${grouped.options.length} CLI flag(s)\n${flagsList}`
    p.note(noteContent, 'CLI Flags')

    for (const varInfo of grouped.options) {
      const message = createPromptMessage(varInfo)
      const isSensitive = isSensitiveVariable(varInfo.cleanName)
      const promptFn = isSensitive ? p.password : p.text

      const placeholder = varInfo.hasFallback
        ? `${varInfo.defaultValue} (default)`
        : `Enter value for --${varInfo.cleanName}`

      const value = await promptFn({
        message,
        placeholder,
        validate: (val) => {
          // Only required if no fallback exists
          if (!val && varInfo.isRequired && !varInfo.hasFallback) {
            return 'This value is required'
          }
        }
      })

      if (p.isCancel(value)) {
        p.cancel('Setup cancelled')
        process.exit(0)
      }

      userInputs.options[varInfo.cleanName] = value || varInfo.defaultValue
    }
  }

  // Prompt for environment variables
  if (grouped.env.length > 0) {
    const envList = grouped.env.map(v => {
      const varSyntax = `\${env:${v.cleanName}}`
      return `  - ${varSyntax}`
    }).join('\n')
    const noteContent = `Found ${grouped.env.length} environment variable(s)\n${envList}`
    p.note(noteContent, 'Environment Variables')

    for (const varInfo of grouped.env) {
      const message = createPromptMessage(varInfo)
      const isSensitive = isSensitiveVariable(varInfo.cleanName)
      const promptFn = isSensitive ? p.password : p.text

      const placeholder = varInfo.hasFallback
        ? `${varInfo.defaultValue} (default)`
        : `Enter environment variable for ${varInfo.cleanName}`

      const value = await promptFn({
        message,
        placeholder,
        validate: (val) => {
          // Only required if no fallback exists
          if (!val && varInfo.isRequired && !varInfo.hasFallback) {
            return 'This value is required'
          }
        }
      })

      if (p.isCancel(value)) {
        p.cancel('Setup cancelled')
        process.exit(0)
      }

      userInputs.env[varInfo.cleanName] = value || varInfo.defaultValue
    }
  }

  // Prompt for self references (if any need values)
  if (grouped.self.length > 0) {
    const selfList = grouped.self.map(v => {
      const varSyntax = `\${self:${v.cleanName}}`
      return `  - ${varSyntax}`
    }).join('\n')
    const noteContent = `Found ${grouped.self.length} config reference(s)\n${selfList}`
    p.note(noteContent, 'Config References')

    for (const varInfo of grouped.self) {
      const message = createPromptMessage(varInfo)
      const isSensitive = isSensitiveVariable(varInfo.cleanName)
      const promptFn = isSensitive ? p.password : p.text

      const placeholder = varInfo.hasFallback
        ? `${varInfo.defaultValue} (default)`
        : `Enter value for ${varInfo.cleanName}`

      const value = await promptFn({
        message,
        placeholder,
        validate: (val) => {
          // Only required if no fallback exists
          if (!val && varInfo.isRequired && !varInfo.hasFallback) {
            return 'This value is required'
          }
        }
      })

      if (p.isCancel(value)) {
        p.cancel('Setup cancelled')
        process.exit(0)
      }

      userInputs.self[varInfo.cleanName] = value || varInfo.defaultValue
    }
  }

  p.outro(chalk.green('Setup complete!'))

  // Remove empty sections
  if (Object.keys(userInputs.options).length === 0) {
    delete userInputs.options
  }
  if (Object.keys(userInputs.env).length === 0) {
    delete userInputs.env
  }
  if (Object.keys(userInputs.self).length === 0) {
    delete userInputs.self
  }

  return userInputs
}

module.exports = {
  runConfigWizard,
  groupVariablesByType,
  isSensitiveVariable,
  createPromptMessage,
}
