// Wizard to prompt user through config setup
const p = require('@clack/prompts')
const chalk = require('./chalk')
const dotProp = require('dot-prop')
const fs = require('fs')
const path = require('path')
const { toClickablePath } = require('./createEditorLink')
const { buildConfigRequirements } = require('../requirements/configRequirements')
const { createPromptDescriptors } = require('./promptDescriptors')
const { isSensitiveVariable } = require('../redaction/redact')

const INVISIBLE_SPACE = '\u2800\u2800\u2800'

/**
 * Prefixes each line of multiline text with INVISIBLE_SPACE repeated a specified number of times
 * @param {number} count - Number of times to repeat INVISIBLE_SPACE for prefix
 * @param {string} text - Multiline text to prefix
 * @returns {string} Text with each line prefixed with INVISIBLE_SPACE
 */
function prefixMultilineText(count, text) {
  if (!text) return text
  const prefix = INVISIBLE_SPACE.repeat(count)
  return text.split('\n').map(line => `${prefix}${line}`).join('\n')
}

/**
 * Formats multiline text for wizard display with leading pipe and invisible space indentation
 * @param {number} indentCount - Number of times to repeat INVISIBLE_SPACE for indentation
 * @param {string} text - Multiline text to format
 * @param {boolean} addLeadingEmptyLine - Whether to add empty line with pipe before first line (default: true)
 * @returns {string} Formatted text with pipe prefix and indentation
 */
function formatWizardMultilineText(indentCount, text, addLeadingEmptyLine = true) {
  if (!text) return text
  const indent = INVISIBLE_SPACE.repeat(indentCount)
  const lines = text.split('\n')
  const formattedLines = lines.map(line => `${chalk.gray('│')}${indent}${line}`)
  const leadingLine = addLeadingEmptyLine ? `${chalk.gray('│')}\n` : '\n'
  return leadingLine + formattedLines.join('\n') + `\n${chalk.gray('│')}`
}

/**
 * Removes a single pair of matching surrounding quotes from a string.
 * Mirrors how configorama strips quotes from inline fallback values like `'us-east-1'`.
 * @param {*} val - Value to clean
 * @returns {*} The value without surrounding quotes (non-strings pass through)
 */
function stripQuotes(val) {
  if (typeof val !== 'string') return val
  const match = val.match(/^(['"])([\s\S]*)\1$/)
  return match ? match[2] : val
}

/**
 * Shortens a file path for display so long absolute paths don't wrap the prompt box.
 * Prefers a path relative to cwd when shorter, then truncates the front, keeping the filename.
 * @param {string} filePath - Path to display
 * @param {number} maxLen - Maximum display length (default 56)
 * @returns {string} Display-friendly path
 */
function formatPathForDisplay(filePath, maxLen = 56) {
  if (!filePath) return filePath
  const display = toClickablePath(filePath)
  if (display.length <= maxLen) return display
  return '…' + display.slice(display.length - (maxLen - 1))
}

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
    dotProp: [],
  }

  // Track variables we've already added to avoid duplicates
  const addedVars = new Set()

  for (const [varKey, varData] of Object.entries(uniqueVariables)) {
    const { variable, variableType, isRequired, defaultValue, defaultValueSrc, occurrences, innerVariables, hasValue, resolvedValue } = varData

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
          resolvedValue,
          occurrences: occurrences || [],
        }

        if (variableType === 'options') {
          grouped.options.push(varInfo)
        } else if (variableType === 'env') {
          grouped.env.push(varInfo)
        } else if (variableType === 'self') {
          grouped.self.push(varInfo)
        } else if (variableType === 'dot.prop') {
          grouped.dotProp.push(varInfo)
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

function shouldPromptDescriptor(descriptor) {
  if (descriptor.variableType === 'option' || descriptor.variableType === 'env') return true
  if (descriptor.variableType === 'self' || descriptor.variableType === 'dotProp') {
    return descriptor.required && (descriptor.defaultValue === null || descriptor.defaultValue === undefined)
  }
  return false
}

function descriptorToVarInfo(descriptor) {
  const variableType = descriptor.variableType === 'option'
    ? 'options'
    : descriptor.variableType === 'dotProp'
      ? 'dot.prop'
      : descriptor.variableType
  const hasDefault = descriptor.defaultValue !== null && descriptor.defaultValue !== undefined && descriptor.defaultValue !== ''

  return {
    key: descriptor.variable,
    variable: descriptor.variable,
    cleanName: descriptor.name,
    variableType,
    type: descriptor.type,
    isRequired: descriptor.required,
    defaultValue: descriptor.defaultValue,
    hasFallback: hasDefault,
    resolvedValue: descriptor.variableType === 'env' && process.env[descriptor.name] !== undefined
      ? descriptor.defaultValue
      : undefined,
    occurrences: descriptor.occurrences || [],
    descriptions: descriptor.description ? [descriptor.description] : [],
    allowedValues: descriptor.allowedValues,
    conflictWarning: descriptor.conflictWarning,
    obtainHint: descriptor.obtainHint,
    examples: descriptor.examples,
    defaultHint: descriptor.defaultHint,
    group: descriptor.group,
    deprecationMessage: descriptor.deprecationMessage,
    sensitive: descriptor.sensitive,
  }
}

function groupPromptDescriptorsForWizard(descriptors) {
  const grouped = {
    options: [],
    env: [],
    self: [],
    dotProp: [],
  }

  for (const descriptor of descriptors || []) {
    if (!shouldPromptDescriptor(descriptor)) continue
    const varInfo = descriptorToVarInfo(descriptor)
    if (descriptor.variableType === 'option') grouped.options.push(varInfo)
    else if (descriptor.variableType === 'env') grouped.env.push(varInfo)
    else if (descriptor.variableType === 'self') grouped.self.push(varInfo)
    else if (descriptor.variableType === 'dotProp') grouped.dotProp.push(varInfo)
  }

  return grouped
}

function isVarInfoSensitive(varInfo) {
  if (varInfo && typeof varInfo.sensitive === 'boolean') return varInfo.sensitive
  return isSensitiveVariable(varInfo.cleanName)
}

function uniqueCompact(values) {
  return [...new Set((values || []).filter(value => value !== undefined && value !== null && value !== ''))]
}

function getAnnotationDisplayMetadata(varInfo) {
  const occurrences = varInfo && Array.isArray(varInfo.occurrences) ? varInfo.occurrences : []
  const examples = uniqueCompact([
    ...(Array.isArray(varInfo.examples) ? varInfo.examples : []),
    ...occurrences.flatMap(occ => Array.isArray(occ.examples) ? occ.examples : [])
  ])

  return {
    obtainHint: varInfo.obtainHint || occurrences.find(occ => occ.obtainHint)?.obtainHint,
    examples,
    defaultHint: varInfo.defaultHint || occurrences.find(occ => occ.defaultHint)?.defaultHint,
    group: varInfo.group || occurrences.find(occ => occ.group)?.group,
    deprecationMessage: varInfo.deprecationMessage || occurrences.find(occ => occ.deprecationMessage)?.deprecationMessage,
  }
}

/**
 * Validates input value based on expected type
 * @param {string} value - Input value
 * @param {string} expectedType - Expected type (String, Number, Boolean, Json)
 * @returns {string|undefined} Error message if invalid, undefined if valid
 */
function validateType(value, expectedType) {
  if (!expectedType || !value) return
  const normalizedType = {
    boolean: 'Boolean',
    number: 'Number',
    string: 'String',
    json: 'Json',
    object: 'Object',
    array: 'Array',
  }[expectedType] || expectedType

  switch (normalizedType) {
    case 'Boolean':
      const lowerVal = value.toLowerCase()
      const validBooleans = ['true', 'false', 'yes', 'no', 'on', 'off', '1', '0']
      if (!validBooleans.includes(lowerVal)) {
        return `Must be a boolean value (true/false, yes/no, on/off, 1/0)`
      }
      break

    case 'Number':
      if (isNaN(Number(value))) {
        return `Must be a valid number`
      }
      break

    case 'Json':
      try {
        JSON.parse(value)
      } catch (e) {
        return `Must be valid JSON`
      }
      break

    case 'Object':
      try {
        const parsed = JSON.parse(value)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return `Must be a valid JSON object`
        }
      } catch (e) {
        return `Must be valid JSON`
      }
      break

    case 'Array':
      if (Array.isArray(value)) break
      if (typeof value !== 'string') return `Must be a comma-separated list or JSON array`
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) break
        return `Must be a JSON array`
      } catch (e) {
        if (!value.includes(',')) return `Must be a comma-separated list or JSON array`
      }
      break

    case 'String':
      // String is always valid
      break
  }
}

/**
 * Extracts type from variable data or occurrences
 * @param {object} varData - Variable data with types array or occurrences
 * @returns {string|null} Expected type or null
 */
function getExpectedType(varData) {
  if (varData && varData.type) {
    return varData.type
  }

  // Use pre-computed types if available
  if (varData && varData.types && varData.types.length > 0) {
    return varData.types[0]
  }

  // Fallback to checking occurrences
  const occurrences = varData && varData.occurrences ? varData.occurrences : varData
  if (!occurrences || !Array.isArray(occurrences) || occurrences.length === 0) return null

  for (const occ of occurrences) {
    // Check pre-computed type on occurrence
    if (occ.type) return occ.type

    // Fallback to filters
    if (occ.filters && Array.isArray(occ.filters)) {
      for (const filter of occ.filters) {
        if (filter && typeof filter === 'string' && /^[A-Z]/.test(filter)) {
          return filter
        }
      }
    }
  }
  return null
}

/**
 * Extracts help text from variable data or occurrences
 * @param {object} varData - Variable data with descriptions array or occurrences
 * @returns {string|null} Help text or null
 */
function getHelpText(varData) {
  // Use pre-computed descriptions if available
  if (varData && varData.descriptions && varData.descriptions.length > 0) {
    return varData.descriptions.join('. ')
  }

  // Fallback to checking occurrences
  const occurrences = varData && varData.occurrences ? varData.occurrences : varData
  if (!occurrences || !Array.isArray(occurrences) || occurrences.length === 0) return null

  for (const occ of occurrences) {
    if (occ.description) {
      return occ.description
    }

    // Fallback to checking filters array
    if (occ.filters && Array.isArray(occ.filters)) {
      for (const filter of occ.filters) {
        const helpMatch = filter.match(/^help\(['"](.+)['"]\)$/)
        if (helpMatch) {
          return helpMatch[1]
        }
      }
    }
  }
  return null
}

/**
 * Extracts allowed values from description text like "Deployment stage (dev, staging, production)"
 * @param {object} varData - Variable data with descriptions array or occurrences
 * @returns {string[]|null} Array of allowed values or null if not found
 */
function getAllowedValues(varData) {
  if (varData && varData.allowedValues && varData.allowedValues.length > 0) {
    return varData.allowedValues
  }

  const helpText = getHelpText(varData)
  if (!helpText) return null

  // Match pattern like (value1, value2, value3) at end of description
  const match = helpText.match(/\(([^)]+)\)\s*$/)
  if (!match) return null

  const valuesStr = match[1]
  const values = valuesStr.split(',').map(v => v.trim()).filter(Boolean)

  // Only treat as allowed values if we have 2+ options and they look like simple values
  if (values.length < 2) return null
  if (values.some(v => v.includes(' ') && !v.match(/^['"].*['"]$/))) return null

  return values
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
  } else if (variableType === 'dot.prop') {
    typeLabel = 'Config'
  } else {
    typeLabel = 'Value'
  }

  // Check for type - use pre-computed if available
  const expectedType = getExpectedType(varInfo)

  // Append type to label if found
  if (expectedType) {
    typeLabel = `${typeLabel}:${expectedType}`
  }

  // Use pre-computed descriptions if available, otherwise collect from occurrences
  let descriptions = varInfo.descriptions || []
  if (descriptions.length === 0 && occurrences && occurrences.length > 0) {
    descriptions = occurrences
      .map(occ => occ.description)
      .filter((d, i, a) => d && a.indexOf(d) === i)
  }

  // Build context from all occurrences
  let contextHint = ''

  // Show combined descriptions if available
  if (descriptions.length > 0) {
    contextHint = ` - ${descriptions.join('. ')}`
  }
  if (varInfo.conflictWarning) {
    contextHint += `${contextHint ? '\n' : ' - '}Warning: ${varInfo.conflictWarning}`
  }

  const annotationMetadata = getAnnotationDisplayMetadata(varInfo)
  const metadataLines = []
  if (annotationMetadata.group) metadataLines.push(`Group: ${annotationMetadata.group}`)
  if (annotationMetadata.obtainHint) metadataLines.push(`From: ${annotationMetadata.obtainHint}`)
  if (annotationMetadata.examples.length > 0) {
    metadataLines.push(`${annotationMetadata.examples.length === 1 ? 'Example' : 'Examples'}: ${annotationMetadata.examples.join(', ')}`)
  }
  if (annotationMetadata.defaultHint) metadataLines.push(`Default hint: ${annotationMetadata.defaultHint}`)
  if (annotationMetadata.deprecationMessage) metadataLines.push(`Deprecated: ${annotationMetadata.deprecationMessage}`)

  if (metadataLines.length > 0) {
    contextHint += '\n' + formatWizardMultilineText(1, metadataLines.join('\n'), false)
  }

  // Show usage list if there are occurrences
  if (occurrences && occurrences.length > 0) {
    // Parse occurrences into key-value pairs with descriptions
    const parsedOccurrences = occurrences.map(occ => {
      const keyPath = occ.path
      let originalValue = occ.value || occ.originalString || occ.varMatch

      // Strip help() filter from the displayed value
      if (originalValue && typeof originalValue === 'string') {
        // Remove | help('...') or | help("...") - match quoted string inside help()
        originalValue = originalValue.replace(/\s*\|\s*help\(('[^']*'|"[^"]*")\)/g, '')
      }

      if (keyPath && originalValue) {
        return {
          key: keyPath,
          value: originalValue,
          description: occ.description
        }
      } else if (keyPath) {
        return {
          key: keyPath,
          value: '',
          description: occ.description
        }
      }
      return null
    }).filter(Boolean)

    if (parsedOccurrences.length > 0) {
      // Get the variable reference syntax
      let varSyntax
      if (variableType === 'dot.prop') {
        varSyntax = `\${${cleanName}}`
      } else {
        const varPrefix = variableType === 'options' ? 'opt' : variableType === 'env' ? 'env' : 'self'
        varSyntax = `\${${varPrefix}:${cleanName}}`
      }

      // Show variable syntax and count (only if no descriptions, otherwise it's redundant)
      if (descriptions.length === 0) {
        contextHint = ` - ${varSyntax} - Used in ${parsedOccurrences.length} ${parsedOccurrences.length === 1 ? 'place' : 'places'}`
      }

      // Find longest key for alignment
      const maxKeyLength = Math.max(...parsedOccurrences.map(o => o.key.length))

      // Count unique descriptions
      const uniqueDescriptions = new Set(parsedOccurrences.map(o => o.description).filter(Boolean))

      // List all occurrences with bullets and aligned values (using invisible unicode for indentation)
      const usageLines = parsedOccurrences.map(({ key, value, description }) => {
        const padding = ' '.repeat(maxKeyLength - key.length)
        // Only show inline description if there are multiple unique descriptions
        const descComment = description && uniqueDescriptions.size > 1 ? ` - # ${description}` : ''
        return value ? `- ${key}:${padding}    ${value}${descComment}` : `• ${key}${descComment}`
      })
      contextHint += '\n' + formatWizardMultilineText(1, usageLines.join('\n'))
    }
  }

  const message = `[${typeLabel}] ${cleanName}${chalk.gray(contextHint)}`

  return message
}

/**
 * Runs config setup wizard
 * @param {object} metadata - Enriched metadata from configorama
 * @param {object} originalConfig - The original config before resolution
 * @returns {Promise<object>} User inputs by variable type
 */
async function runConfigWizard(metadata, originalConfig = {}, configFilePath = '') {
  const { uniqueVariables } = metadata

  if (!uniqueVariables || Object.keys(uniqueVariables).length === 0) {
    p.intro(chalk.cyan('Configuration Wizard'))
    if (configFilePath) {
      p.note(formatPathForDisplay(configFilePath), 'File')
    }
    p.outro('No variables found that require setup.')
    return {}
  }

  const requirements = buildConfigRequirements(metadata)
  const descriptors = createPromptDescriptors(requirements)
  const grouped = groupPromptDescriptorsForWizard(descriptors)
  const totalVars = grouped.options.length + grouped.env.length + grouped.self.length + grouped.dotProp.length

  if (totalVars === 0) {
    p.intro(chalk.cyan('Configuration Wizard'))
    p.outro('No variables found that require setup.')
    return {}
  }

  p.intro(chalk.cyan('Configuration Wizard'))
  if (configFilePath) {
    p.note(formatPathForDisplay(configFilePath), 'Config file')
  }

  const userInputs = {
    options: {},
    env: {},
    self: {},
    dotProp: {},
  }

  // Prompt for options (CLI flags)
  if (grouped.options.length > 0) {
    const flagsList = grouped.options.map(v => `\${opt:${v.cleanName}}`)
    const flagsDisplay = flagsList.length < 5
      ? flagsList.join(', ')
      : flagsList.map(f => ` - ${f}`).join('\n')
    const addNewLine = flagsList.length > 5 ? '\n' : ' - '
    const noteContent = `Found ${grouped.options.length} CLI flag(s)${addNewLine}${flagsDisplay}`
    p.note(noteContent, 'CLI Flags')

    for (const varInfo of grouped.options) {
      const message = createPromptMessage(varInfo)
      const isSensitive = isVarInfoSensitive(varInfo)
      const expectedType = getExpectedType(varInfo.occurrences)
      const allowedValues = getAllowedValues(varInfo)

      let value
      const cleanDefault = stripQuotes(varInfo.defaultValue)
      if (allowedValues && !isSensitive) {
        // Use select picker for enumerated values
        const options = allowedValues.map(v => ({ value: v, label: v }))
        value = await p.select({
          message,
          options,
          initialValue: cleanDefault || allowedValues[0]
        })
      } else {
        const promptFn = isSensitive ? p.password : p.text
        const placeholder = varInfo.hasFallback
          ? String(cleanDefault)
          : `Enter value for --${varInfo.cleanName}`

        value = await promptFn({
          message,
          placeholder,
          defaultValue: varInfo.hasFallback ? String(cleanDefault) : undefined,
          validate: (val) => {
            // Only required if no fallback exists
            if (!val && varInfo.isRequired && !varInfo.hasFallback) {
              return 'This value is required'
            }
            // Type validation
            const typeError = validateType(val, expectedType)
            if (typeError) return typeError
          }
        })
      }

      if (p.isCancel(value)) {
        p.cancel('Setup cancelled')
        throw new Error('Setup cancelled')
      }

      userInputs.options[varInfo.cleanName] = value || cleanDefault
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
      let message = createPromptMessage(varInfo)
      const isSensitive = isVarInfoSensitive(varInfo)
      const promptFn = isSensitive ? p.password : p.text
      const expectedType = getExpectedType(varInfo.occurrences)

      const cleanCurrent = stripQuotes(varInfo.resolvedValue)
      const cleanDefault = stripQuotes(varInfo.defaultValue)
      let placeholder
      let defaultValue
      if (varInfo.resolvedValue !== undefined) {
        if (isSensitive) {
          // For sensitive vars, show hint in message since password prompts don't show placeholders
          message += formatWizardMultilineText(1, chalk.green(`Notice: process.env.${varInfo.cleanName} set\nPress enter to use current value OR input a new value below`), false)
          // placeholder doesn't work with password prompts
          placeholder = ' enter to use current value or input a new value'
        } else {
          placeholder = String(cleanCurrent)
          defaultValue = String(cleanCurrent)
        }
      } else if (varInfo.hasFallback) {
        placeholder = String(cleanDefault)
        defaultValue = String(cleanDefault)
      } else {
        placeholder = `Enter environment variable for ${varInfo.cleanName}`
      }

      const value = await promptFn({
        message,
        placeholder,
        defaultValue,
        validate: (val) => {
          // Only required if no fallback exists
          if (!val && varInfo.isRequired && !varInfo.hasFallback) {
            return 'This value is required'
          }
          // Type validation
          const typeError = validateType(val, expectedType)
          if (typeError) return typeError
        }
      })

      if (p.isCancel(value)) {
        p.cancel('Setup cancelled')
        throw new Error('Setup cancelled')
      }

      userInputs.env[varInfo.cleanName] = value || cleanCurrent || cleanDefault
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
      const isSensitive = isVarInfoSensitive(varInfo)
      const promptFn = isSensitive ? p.password : p.text
      const expectedType = getExpectedType(varInfo.occurrences)

      const cleanDefault = stripQuotes(varInfo.defaultValue)
      const placeholder = varInfo.hasFallback
        ? String(cleanDefault)
        : `Enter value for ${varInfo.cleanName}`

      const value = await promptFn({
        message,
        placeholder,
        defaultValue: varInfo.hasFallback ? String(cleanDefault) : undefined,
        validate: (val) => {
          // Only required if no fallback exists
          if (!val && varInfo.isRequired && !varInfo.hasFallback) {
            return 'This value is required'
          }
          // Type validation
          const typeError = validateType(val, expectedType)
          if (typeError) return typeError
        }
      })

      if (p.isCancel(value)) {
        p.cancel('Setup cancelled')
        throw new Error('Setup cancelled')
      }

      userInputs.self[varInfo.cleanName] = value || cleanDefault
    }
  }

  // Prompt for config dot.prop references
  if (grouped.dotProp.length > 0) {
    const configList = grouped.dotProp.map(v => {
      const varSyntax = `\${${v.cleanName}}`
      return `  - ${varSyntax}`
    }).join('\n')
    const noteContent = `Found ${grouped.dotProp.length} config reference(s)\n${configList}`
    p.note(noteContent, 'Config References')

    for (const varInfo of grouped.dotProp) {
      const message = createPromptMessage(varInfo)
      const isSensitive = isVarInfoSensitive(varInfo)
      const promptFn = isSensitive ? p.password : p.text
      const expectedType = getExpectedType(varInfo.occurrences)

      const cleanDefault = stripQuotes(varInfo.defaultValue)
      const placeholder = varInfo.hasFallback
        ? String(cleanDefault)
        : `Enter value for ${varInfo.cleanName}`

      const value = await promptFn({
        message,
        placeholder,
        defaultValue: varInfo.hasFallback ? String(cleanDefault) : undefined,
        validate: (val) => {
          // Only required if no fallback exists
          if (!val && varInfo.isRequired && !varInfo.hasFallback) {
            return 'This value is required'
          }
          // Type validation
          const typeError = validateType(val, expectedType)
          if (typeError) return typeError
        }
      })

      if (p.isCancel(value)) {
        p.cancel('Setup cancelled')
        throw new Error('Setup cancelled')
      }

      userInputs.dotProp[varInfo.cleanName] = value || cleanDefault
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
  if (Object.keys(userInputs.dotProp).length === 0) {
    delete userInputs.dotProp
  }

  return userInputs
}

module.exports = {
  runConfigWizard,
  groupVariablesByType,
  groupPromptDescriptorsForWizard,
  descriptorToVarInfo,
  isSensitiveVariable,
  isVarInfoSensitive,
  createPromptMessage,
  getExpectedType,
  getHelpText,
  getAllowedValues,
  validateType,
  prefixMultilineText,
  formatWizardMultilineText,
  formatPathForDisplay,
  stripQuotes,
}
