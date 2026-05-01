// CLI display formatting for variable info, verify, and discovery output
// Pure functions that write directly to stdout

const chalk = require('./utils/ui/chalk')
const { logHeader } = require('./utils/ui/logs')
const { makeStackedBoxes } = require('@davidwells/box-logger')
const { findLineForKey } = require('./utils/paths/findLineForKey')
const { createEditorLink } = require('./utils/ui/createEditorLink')
const { isSensitiveVariable } = require('./utils/ui/configWizard')

const SPACING = '           '
const TITLE_TEXT = `Variable:${SPACING}`
const VALUE_HEX = '#899499'

/**
 * Display "No Variables Found" message
 * @param {string} configFilePath
 * @param {RegExp} variableSyntax
 * @param {Object} variableTypes
 */
function displayNoVariablesFound(configFilePath, variableSyntax, variableTypes) {
  logHeader('No Variables Found in Config')
  if (configFilePath) {
    console.log(`File: ${configFilePath}`)
  }

  console.log(`\nVariable syntax: `, variableSyntax)

  const varTypes = Object.keys(variableTypes)
  if (varTypes.length) {
    const exclude = ['dot.prop', 'deep']
    console.log('\nAllowed variable types:')
    varTypes.forEach((v) => {
      const vData = variableTypes[v]
      if (exclude.includes(vData.type)) {
        return
      }
      console.log(`  - ${vData.type}: `, vData.match)
    })
  }
  console.log()
}

/**
 * Display variable details in stacked box format
 * @param {Object} params
 * @param {string[]} params.varKeys
 * @param {Object} params.variableData
 * @param {Object} params.uniqueVariables
 * @param {RegExp} params.varPrefixPattern
 * @param {RegExp} params.varSuffixPattern
 * @param {string[]} params.lines
 * @param {string} params.fileType
 * @param {string} params.configFilePath
 */
function displayVariableDetails({ varKeys, variableData, uniqueVariables, varPrefixPattern, varSuffixPattern, lines, fileType, configFilePath }) {
  if (!varKeys.length) return

  const getBaseVarName = (key) => key.replace(varPrefixPattern, '').replace(varSuffixPattern, '').split(',')[0].trim()

  const fileName = configFilePath ? ` in ${configFilePath}` : ''

  logHeader(`Found ${varKeys.length} Variables${fileName}`)

  // deepLog('variableData', variableData)

  if (varKeys.length) {
    console.log()
    const longestKey = varKeys.reduce((acc, k) => {
      return Math.max(acc, k.length)
    }, 0)

    // Use uniqueVariables for simpler reference counting
    const referenceData = varKeys.map((k) => {
      const varName = getBaseVarName(k)
      const uniqueVar = uniqueVariables[varName]
      const refCount = uniqueVar ? uniqueVar.occurrences.length : variableData[k].length
      const placesWord = refCount > 1 ? 'places' : 'place'
      return `- ${k.padEnd(longestKey).padEnd(longestKey + 10)} referenced ${refCount} ${placesWord}`
    }).join('\n')

    console.log(`${referenceData}\n`)
  }

  logHeader('Variable Details')

  const keyChalk = chalk.whiteBright
  const valueChalk = chalk.hex(VALUE_HEX)

  const indent = ''
  const boxes = varKeys.map((key, i) => {
    const variableInstances = variableData[key]
    // console.log('variableInstances', variableInstances)
    const firstInstance = variableInstances[0]

    // Get uniqueVariable data for description and other metadata
    const varName = getBaseVarName(key)
    const uniqueVar = uniqueVariables[varName]

    // Build display message from enriched metadata
    let varMsg = ''
    let requiredMessage = ''

    // Show required status from metadata
    if (firstInstance.isRequired) {
      requiredMessage = `${chalk.red.bold('[Required]')}`
    }

    // Show type filter if present (Boolean, String, Number, etc.)
    if (uniqueVar && uniqueVar.types && uniqueVar.types.length > 0) {
      const typeLabel = `${indent}${keyChalk('Type:'.padEnd(TITLE_TEXT.length, ' '))}`
      varMsg += `${typeLabel} ${valueChalk(uniqueVar.types.join(', '))}\n`
    }

    // Show description from uniqueVariables if available
    if (uniqueVar && uniqueVar.descriptions && uniqueVar.descriptions.length > 0) {
      const descText = `${indent}${keyChalk('Description:'.padEnd(TITLE_TEXT.length, ' '))}`
      const combinedDesc = uniqueVar.descriptions.join('. ')
      varMsg += `${descText} ${valueChalk(combinedDesc)}\n`
    }

    // Show resolve order from metadata
    if (firstInstance.resolveOrder.length > 1) {
      varMsg += `${indent}${keyChalk('Resolve Order:'.padEnd(TITLE_TEXT.length, ' '))}`
      const resolveOrder = firstInstance.resolveOrder.join(', ')
      varMsg += ` ${valueChalk(resolveOrder)}\n`
    }

    // Show default value from metadata
    if (typeof firstInstance.defaultValue !== 'undefined') {
      const defaultValueRender = firstInstance.defaultValue === '' ? '""' : firstInstance.defaultValue
      const defaultValueText = `${indent}${keyChalk('Default value:'.padEnd(TITLE_TEXT.length, ' '))}`
      varMsg += `${defaultValueText} ${valueChalk(defaultValueRender)}\n`
    }

    // Show default value source path from metadata
    if (firstInstance.defaultValueSrc) {
      varMsg += `${indent}${keyChalk('Default path:'.padEnd(TITLE_TEXT.length, ' '))} `
      const defaultPathLine = findLineForKey(firstInstance.defaultValueSrc, lines, fileType)
      if (defaultPathLine) {
        varMsg += `${createEditorLink(configFilePath, defaultPathLine, 1, firstInstance.defaultValueSrc, 'gray')}\n`
      } else {
        varMsg += `${valueChalk(firstInstance.defaultValueSrc)}\n`
      }
    }

    // Show path(s) from metadata
    const configPathLine = findLineForKey(variableInstances[0].path, lines, fileType)
    let locationRender = configPathLine
      ? createEditorLink(configFilePath, configPathLine, 1, variableInstances[0].path, 'gray')
      : valueChalk(variableInstances[0].path)
    let locationLabel = `${indent}${keyChalk('Config Path:'.padEnd(TITLE_TEXT.length, ' '))}`
    let typeText = ''
    if (variableInstances.length > 1) {
      const pathIndent = ' '.repeat(TITLE_TEXT.length + 1)
      const pathItems = variableInstances.map((v, idx) => {
        const pathLine = findLineForKey(v.path, lines, fileType)
        const pathLink = pathLine
          ? createEditorLink(configFilePath, pathLine, 1, `- ${v.path}`, 'gray')
          : valueChalk(`- ${v.path}`)
        // Show type filter per path if different
        if (uniqueVar && uniqueVar.occurrences.length > 1) {
          const occurrence = uniqueVar.occurrences.find(occ => occ.path === v.path)
          const pathType = occurrence && occurrence.type
          typeText = pathType ? ` ${chalk.dim(`Type: ${pathType}`)}` : ''
          const prefix = idx === 0 ? '' : `${indent}${pathIndent}`
          return `${prefix}${pathLink}${typeText}`
        }
        const prefix = idx === 0 ? '' : `${indent}${pathIndent}`
        return `${prefix}${pathLink}${typeText}`
      })
      locationRender = pathItems.join('\n')
      locationLabel = `${indent}${keyChalk('Config Paths:'.padEnd(TITLE_TEXT.length, ' '))}`
    } else {
      const pathType = firstInstance.type
      typeText = pathType ? ` ${chalk.dim(`Type: ${pathType}`)}` : ''
    }
    varMsg += `${locationLabel} ${locationRender}`

    const lineNumber = findLineForKey(firstInstance.key, lines, fileType)

    return {
      content: {
        left: varMsg,
        backgroundColor: 'red',
        width: '100%',
      },
      title: {
        left: `▷ ${lineNumber ? createEditorLink(configFilePath, lineNumber, 1, key) : key}`,
        right: lineNumber ? createEditorLink(configFilePath, lineNumber, 1, `${requiredMessage} ${lineNumber ? `Line: ${lineNumber.toString().padEnd(2, ' ')}` : ''}`, 'gray') : '',
        center: typeText,
        paddingBottom: 1,
        paddingTop: (i === 0) ? 1 : 0,
        truncate: true,
      },
      width: '100%',
    }
  })

  console.log(makeStackedBoxes(boxes, {
    borderText: 'Variable Details. Click on titles to open in editor.',
    borderColor: 'gray',
    minWidth: '96%',
    borderStyle: 'bold',
    disableTitleSeparator: true,
  }))
  // process.exit(1)
}

/**
 * Display unique variables in stacked box format
 * @param {Object} params
 * @param {string[]} params.uniqueVarKeys
 * @param {Object} params.uniqueVariables
 * @param {string[]} params.lines
 * @param {string} params.fileType
 * @param {string} params.configFilePath
 */
function displayUniqueVariables({ uniqueVarKeys, uniqueVariables, lines, fileType, configFilePath }) {
  const keyChalk = chalk.whiteBright
  const valueChalk = chalk.hex(VALUE_HEX)

  // New unique variable makeStackedBoxes display
  const uniqueBoxes = uniqueVarKeys.map((varName, i) => {
    const uniqueVar = uniqueVariables[varName]
    const occurrences = uniqueVar.occurrences || []
    const firstOcc = occurrences[0] || {}

    let varMsg = ''
    let requiredMessage = ''

    // Show required status from computed isRequired (accounts for resolved self-refs)
    const isRequired = occurrences.some(occ => occ.isRequired)
    if (isRequired) {
      requiredMessage = `${chalk.red.bold('[Required]')}`
    }

    // Show type filter if present
    if (uniqueVar.types && uniqueVar.types.length > 0) {
      const typeLabel = `${keyChalk('Type:'.padEnd(TITLE_TEXT.length, ' '))}`
      varMsg += `${typeLabel} ${valueChalk(uniqueVar.types.join(', '))}\n`
    }

    // Show description
    if (uniqueVar.descriptions && uniqueVar.descriptions.length > 0) {
      const descText = `${keyChalk('Description:'.padEnd(TITLE_TEXT.length, ' '))}`
      const combinedDesc = uniqueVar.descriptions.join('. ')
      varMsg += `${descText} ${valueChalk(combinedDesc)}\n`
    }

    // Show default value only if it's a true fallback, not a pre-resolved value
    // Redact sensitive values like API keys, secrets, tokens
    const isSensitive = isSensitiveVariable(varName)
    const hasActualDefault = firstOcc.hasFallback && typeof firstOcc.defaultValue !== 'undefined'
    if (hasActualDefault) {
      const defaultValueRender = isSensitive ? '********' : (firstOcc.defaultValue === '' ? '""' : firstOcc.defaultValue)
      const defaultValueText = `${keyChalk('Default value:'.padEnd(TITLE_TEXT.length, ' '))}`
      varMsg += `${defaultValueText} ${valueChalk(defaultValueRender)}\n`
    } else if (uniqueVar.resolvedValue !== undefined) {
      // Show pre-resolved current value (e.g., from env, git)
      const resolvedRender = isSensitive ? '********' : (uniqueVar.resolvedValue === '' ? '""' : uniqueVar.resolvedValue)
      const resolvedText = `${keyChalk('Current value:'.padEnd(TITLE_TEXT.length, ' '))}`
      const envIndicator = uniqueVar.variableType === 'env' ? ` ${chalk.red('(currently set env var)')}` : ''
      varMsg += `${resolvedText} ${valueChalk(resolvedRender)}${envIndicator}\n`
    }

    // Show default value source path
    if (firstOcc.defaultValueSrc) {
      varMsg += `${keyChalk('Default path:'.padEnd(TITLE_TEXT.length, ' '))} `
      const defaultPathLine = findLineForKey(firstOcc.defaultValueSrc, lines, fileType)
      if (defaultPathLine) {
        varMsg += `${createEditorLink(configFilePath, defaultPathLine, 1, firstOcc.defaultValueSrc, 'gray')}\n`
      } else {
        varMsg += `${valueChalk(firstOcc.defaultValueSrc)}\n`
      }
    }

    // Show config path(s) from occurrences
    let locationRender
    let locationLabel
    if (occurrences.length > 1) {
      const pathIndent = ' '.repeat(TITLE_TEXT.length + 1)
      const pathItems = occurrences.map((occ, idx) => {
        const pathLine = findLineForKey(occ.path, lines, fileType)
        const pathLink = pathLine
          ? createEditorLink(configFilePath, pathLine, 1, `- ${occ.path}`, 'gray')
          : valueChalk(`- ${occ.path}`)
        const typeText = occ.type ? ` ${chalk.dim(`Type: ${occ.type}`)}` : ''
        const prefix = idx === 0 ? '' : `${pathIndent}`
        return `${prefix}${pathLink}${typeText}`
      })
      locationRender = pathItems.join('\n')
      locationLabel = `${keyChalk('Config Paths:'.padEnd(TITLE_TEXT.length, ' '))}`
    } else {
      const pathLine = findLineForKey(firstOcc.path, lines, fileType)
      locationRender = pathLine
        ? createEditorLink(configFilePath, pathLine, 1, firstOcc.path, 'gray')
        : valueChalk(firstOcc.path)
      locationLabel = `${keyChalk('Config Path:'.padEnd(TITLE_TEXT.length, ' '))}`
    }
    varMsg += `${locationLabel} ${locationRender}`

    // Find first line number for title
    const lineNumber = findLineForKey(firstOcc.path, lines, fileType)

    return {
      content: {
        left: varMsg,
        backgroundColor: 'red',
        width: '100%',
      },
      title: {
        left: `▷ ${firstOcc.varMatch}`,
        right: `${requiredMessage} ${lineNumber ? `Line: ${lineNumber.toString().padEnd(2, ' ')}` : ''}`,
        paddingBottom: 1,
        paddingTop: (i === 0) ? 1 : 0,
        truncate: true,
      },
      width: '100%',
    }
  })

  console.log(makeStackedBoxes(uniqueBoxes, {
    borderText: 'Unique Variables',
    borderColor: 'gray',
    minWidth: '96%',
    borderStyle: 'bold',
    disableTitleSeparator: true,
  }))
  console.log()
}

/**
 * Display configurable variables grouped by source type
 * @param {Object} params
 * @param {string[]} params.uniqueVarKeys
 * @param {Object} params.uniqueVariables
 * @param {string[]} params.lines
 * @param {string} params.fileType
 * @param {string} params.configFilePath
 */
function displayConfigurableVariables({ uniqueVarKeys, uniqueVariables, lines, fileType, configFilePath }) {
  // Unique variables that require setup (excludes readonly source types)
  const CONFIGURABLE_SOURCES = ['user', 'config', 'remote']
  const configurableVarKeys = []

  for (const varName of uniqueVarKeys) {
    const uniqueVar = uniqueVariables[varName]
    // Include if source type is user, config, or remote (not readonly)
    if (CONFIGURABLE_SOURCES.includes(uniqueVar.variableSourceType)) {
      configurableVarKeys.push(varName)
    }
  }

  if (!configurableVarKeys.length) return

  const keyChalk = chalk.whiteBright
  const valueChalk = chalk.hex(VALUE_HEX)

  // Group by source type
  const bySource = {
    user: [],
    config: [],
    remote: [],
  }

  for (const varName of configurableVarKeys) {
    const v = uniqueVariables[varName]
    const sourceType = v.variableSourceType || 'user'
    if (bySource[sourceType]) {
      bySource[sourceType].push({ varName, ...v })
    }
  }

  const configurableBoxes = []

  for (const [sourceType, vars] of Object.entries(bySource)) {
    if (vars.length === 0) continue

    for (let i = 0; i < vars.length; i++) {
      const v = vars[i]
      const occurrences = v.occurrences || []
      const firstOcc = occurrences[0] || {}

      let varMsg = ''
      let requiredMessage = ''

      // Show required status from computed isRequired (accounts for resolved self-refs)
      const isRequired = occurrences.some(occ => occ.isRequired)
      if (isRequired) {
        requiredMessage = `${chalk.red.bold('[Required]')}`
      }

      // Show description if present (directly under title, not as key/value)
      if (v.descriptions && v.descriptions.length > 0) {
        varMsg += `${chalk.dim(v.descriptions.join('. '))}\n\n`
      }

      // Show type filter if defined (String, Number, etc.)
      const varType = (v.types && v.types[0]) || firstOcc.type
      if (varType) {
        varMsg += `${keyChalk('Type:'.padEnd(TITLE_TEXT.length, ' '))} ${valueChalk(varType)}\n`
      }

      // Show current/default value (redact sensitive values)
      const isSensitive = isSensitiveVariable(v.varName)
      if (v.resolvedValue !== undefined) {
        const resolvedRender = isSensitive ? '********' : (v.resolvedValue === '' ? '""' : v.resolvedValue)
        varMsg += `${keyChalk('Current value:'.padEnd(TITLE_TEXT.length, ' '))} ${valueChalk(resolvedRender)}\n`
      } else if (firstOcc.hasFallback && firstOcc.defaultValue !== undefined) {
        const defaultRender = isSensitive ? '********' : (firstOcc.defaultValue === '' ? '""' : firstOcc.defaultValue)
        varMsg += `${keyChalk('Default value:'.padEnd(TITLE_TEXT.length, ' '))} ${valueChalk(defaultRender)}\n`
      }

      // Show config path(s)
      let locationRender
      let locationLabel
      if (occurrences.length > 1) {
        const pathIndent = ' '.repeat(TITLE_TEXT.length + 1)
        const pathItems = occurrences.map((occ, idx) => {
          const pathLine = findLineForKey(occ.path, lines, fileType)
          const pathLink = pathLine
            ? createEditorLink(configFilePath, pathLine, 1, `- ${occ.path}`, VALUE_HEX)
            : valueChalk(`- ${occ.path}`)
          const prefix = idx === 0 ? '' : `${pathIndent}`
          return `${prefix}${pathLink}`
        })
        locationRender = pathItems.join('\n')
        locationLabel = 'Config Paths:'
      } else {
        const pathLine = findLineForKey(firstOcc.path, lines, fileType)
        locationRender = pathLine
          ? createEditorLink(configFilePath, pathLine, 1, firstOcc.path, VALUE_HEX)
          : valueChalk(firstOcc.path)
        locationLabel = 'Config Path:'
      }
      varMsg += `${keyChalk(locationLabel.padEnd(TITLE_TEXT.length, ' '))} ${locationRender}`

      // Get type for center heading (reuse varType from above)
      const typeText = varType ? chalk.dim(`Type: ${varType}`) : ''

      // Get line number for first occurrence
      const firstOccLine = findLineForKey(firstOcc.path, lines, fileType)
      const varTitle = firstOcc.varMatch || v.varName
      const requiredSuffix = requiredMessage ? ` - ${requiredMessage}` : ''
      const titleLink = firstOccLine
        ? createEditorLink(configFilePath, firstOccLine, 1, `▷ ${varTitle}`) + requiredSuffix
        : `▷ ${varTitle}${requiredSuffix}`

      configurableBoxes.push({
        content: {
          left: varMsg,
          width: '100%',
        },
        title: {
          left: titleLink,
          // center: typeText,
          right: chalk.dim(`${v.variableType}`),
          paddingBottom: 1,
          paddingTop: (configurableBoxes.length === 0) ? 1 : 0,
          truncate: true,
        },
        width: '100%',
      })
    }
  }

  if (configurableBoxes.length > 0) {
    console.log(makeStackedBoxes(configurableBoxes, {
      borderText: `Configurable Variables (${configurableVarKeys.length})`,
      borderColor: 'yellow',
      minWidth: '96%',
      borderStyle: 'bold',
      disableTitleSeparator: true,
    }))
    console.log()
  }
}

module.exports = {
  displayNoVariablesFound,
  displayVariableDetails,
  displayUniqueVariables,
  displayConfigurableVariables,
}
