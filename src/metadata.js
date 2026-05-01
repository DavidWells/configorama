// Variable metadata collection — traverses config to catalog variable usage
// Pure function that receives all data as arguments

const path = require('path')
const fs = require('fs')
const traverse = require('traverse')
const dotProp = require('dot-prop')
const { normalizePath, extractFilePath, resolveInnerVariables } = require('./utils/paths/filePathUtils')
const { findNestedVariables } = require('./utils/variables/findNestedVariables')
const { splitOnPipe } = require('./utils/strings/splitOnPipe')

/**
 * Collect metadata about all variables found in the configuration
 * @param {Object} params
 * @param {RegExp} params.variableSyntax
 * @param {Object} params.variablesKnownTypes
 * @param {Object} params.variableTypes
 * @param {RegExp|null} params.filterMatch
 * @param {string} params.configFilePath
 * @param {Object} params.displayConfig - rawOriginalConfig || originalConfig, used for traversal
 * @param {Object} params.originalConfig - this.originalConfig, used for dotProp.get checks
 * @param {string} params.varSuffix
 * @param {RegExp} params.varSuffixWithSpacePattern
 * @returns {Object} Metadata object containing variables, fileDependencies, and summary
 */
function collectVariableMetadata({
  variableSyntax,
  variablesKnownTypes,
  variableTypes,
  filterMatch,
  configFilePath,
  displayConfig,
  originalConfig,
  varSuffix,
  varSuffixWithSpacePattern,
}) {
  const foundVariables = []
  const variableData = {}
  const fileRefs = []
  const fileGlobPatterns = []
  const preResolvedPaths = new Set()
  const byConfigPath = []
  const referencesMap = new Map()
  let matchCount = 1

  traverse(displayConfig).forEach(function (rawValue) {
    if (typeof rawValue === 'string' && rawValue.match(variableSyntax)) {
      const configValuePath = this.path.join('.')
      /* Skip Fn::Sub variables */
      if (configValuePath.endsWith('Fn::Sub')) {
        return
      }

      const nested = findNestedVariables(
        rawValue,
        variableSyntax,
        variablesKnownTypes,
        configValuePath,
        variableTypes
      )

      const lastItem = nested[nested.length - 1]
      const lastKeyPath = this.path[this.path.length - 1]
      const itemKey = (lastKeyPath.match(/[\d+]$/)) ? `${this.path[this.path.length - 2]}[${lastKeyPath}]` : lastKeyPath

      // Extract filters from varMatch
      const originalSrc = lastItem.varMatch || ''
      const hasFilters = filterMatch && originalSrc.match(filterMatch)
      let foundFilters = []
      let keyWithoutFilters = originalSrc

      if (hasFilters) {
        // Extract filter names from the match (e.g., "| String}" -> ["String"])
        const filterPart = hasFilters[0].replace(/}?$/, '') // Remove trailing }
        foundFilters = splitOnPipe(filterPart)
          .map((filter) => filter.trim())
          .filter(Boolean)

        // Remove filters from the key (replace "| String}" with suffix)
        // Also clean up any trailing whitespace before the closing brace
        keyWithoutFilters = originalSrc.replace(filterMatch, varSuffix).replace(varSuffixWithSpacePattern, varSuffix)
      }

      const key = keyWithoutFilters

      // Helper to pre-resolve a variable from config
      const preResolveFromConfig = (varString, varType) => {
        if (!varString) return undefined
        // Handle self: prefix
        const varPath = varString.startsWith('self:') ? varString.slice(5) : varString
        // Only pre-resolve dot.prop and self references
        if (varType === 'dot.prop' || varType === 'self') {
          const value = dotProp.get(displayConfig, varPath)
          if (value !== undefined && typeof value !== 'object') {
            return { resolved: value, path: varPath }
          }
        }
        return undefined
      }

      // Strip filters from resolveDetails
      const cleanedResolveDetails = nested.map(detail => {
        const cleaned = { ...detail }
        if (cleaned.varMatch && filterMatch) {
          const match = cleaned.varMatch.match(filterMatch)
          if (match) {
            cleaned.varMatch = cleaned.varMatch.replace(filterMatch, '').replace(/\s+$/, '') + varSuffix
          }
        }
        if (cleaned.variable && filterMatch) {
          const match = cleaned.variable.match(filterMatch)
          if (match) {
            cleaned.variable = cleaned.variable.replace(filterMatch, '').replace(/\s+$/, '')
          }
        }
        if (cleaned.varString && filterMatch) {
          const match = cleaned.varString.match(filterMatch)
          if (match) {
            cleaned.varString = cleaned.varString.replace(filterMatch, '').trim()
          }
        }

        // Pre-resolve dot.prop and self references
        const preResolved = preResolveFromConfig(cleaned.varString || cleaned.variable, cleaned.variableType)
        if (preResolved) {
          cleaned.varResolved = preResolved.resolved
          cleaned.varResolvedPath = preResolved.path
        }

        // Also clean fallbackValues if present
        if (cleaned.fallbackValues && Array.isArray(cleaned.fallbackValues)) {
          cleaned.fallbackValues = cleaned.fallbackValues.map(fb => {
            const cleanedFb = { ...fb }
            if (cleanedFb.varMatch && filterMatch) {
              const match = cleanedFb.varMatch.match(filterMatch)
              if (match) {
                cleanedFb.varMatch = cleanedFb.varMatch.replace(filterMatch, '').trim()
              }
            }
            if (cleanedFb.variable && filterMatch) {
              const match = cleanedFb.variable.match(filterMatch)
              if (match) {
                cleanedFb.variable = cleanedFb.variable.replace(filterMatch, '').trim()
              }
            }
            if (cleanedFb.stringValue && filterMatch) {
              const match = cleanedFb.stringValue.match(filterMatch)
              if (match) {
                cleanedFb.stringValue = cleanedFb.stringValue.replace(filterMatch, '').trim()
              }
            }

            // Pre-resolve fallback variable references
            if (cleanedFb.stringValue && cleanedFb.stringValue.match(/^\$\{[^}]+\}$/)) {
              const innerVar = cleanedFb.stringValue.slice(2, -1)
              const fbPreResolved = preResolveFromConfig(innerVar, 'dot.prop')
              if (fbPreResolved) {
                cleanedFb.varResolved = fbPreResolved.resolved
                cleanedFb.varResolvedPath = fbPreResolved.path
              }
            }

            return cleanedFb
          })
        }
        return cleaned
      })

      const varData = {
        filters: foundFilters.length > 0 ? foundFilters : undefined,
        path: configValuePath,
        key: itemKey,
        originalStringValue: rawValue,
        variable: keyWithoutFilters,
        variableWithFilters: originalSrc,
        isRequired: false,
        defaultValue: undefined,
        defaultValueIsVar: undefined,
        defaultValueSrc: undefined,
        hasFallback: false,
        matchIndex: matchCount++,
        resolveOrder: [],
        resolveDetails: cleanedResolveDetails,
      }
      let defaultValueIsVar = false

      function calculateResolveOrder(item) {
        // Helper to strip filters from variable strings
        const stripFilters = (str) => {
          if (!str || !filterMatch) return str
          const match = str.match(filterMatch)
          if (match) {
            return str.replace(filterMatch, '').trim()
          }
          return str
        }

        if (item && item.fallbackValues) {
          let hasResolvedFallback
          let defaultValueSrc
          const isSingleFallback = item.fallbackValues.length === 1
          const order = ([stripFilters(item.valueBeforeFallback)]).concat(item.fallbackValues.map((f, i) => {
            if (f.fallbackValues) {
              const [nestedOrder, nestedResolvedFallback, nestedDefaultSrc] = calculateResolveOrder(f)
              if (!hasResolvedFallback && nestedResolvedFallback) {
                hasResolvedFallback = nestedResolvedFallback
                defaultValueSrc = nestedDefaultSrc
              }
              return nestedOrder
            }

            const valueStr = stripFilters(f.stringValue || f.variable)

            // Only set default from first resolvable fallback
            if (!hasResolvedFallback && f.isResolvedFallback) {
              if (f.varResolved !== undefined) {
                hasResolvedFallback = f.varResolved
                defaultValueSrc = f.varResolvedPath
              } else if (!valueStr.match(/^\$\{[^}]+\}$/)) {
                // Literal value - use as default
                hasResolvedFallback = valueStr
              }
              // If variable can't resolve, don't set - let next fallback try
            }

            if (!hasResolvedFallback && f.isVariable) {
              defaultValueIsVar = f
            }

            if (f.isResolvedFallback) {
              if (isSingleFallback) {
                // Single fallback: show "value (default)"
                return `${valueStr} (default)`
              } else {
                // Multiple fallbacks: show resolved value if available
                if (f.varResolved !== undefined) {
                  return `${valueStr} = ${f.varResolved}`
                }
                // If can't resolve, just show the value without annotation
                return valueStr
              }
            }
            return valueStr
          })).flat()

          return [order, hasResolvedFallback, defaultValueSrc]
        }
        return [[stripFilters(item.variable)], undefined, undefined]
      }

      const lastCleanedItem = cleanedResolveDetails[cleanedResolveDetails.length - 1]
      const [resolveOrder, hasResolvedFallback, defaultValueSrc] = calculateResolveOrder(lastCleanedItem)
      varData.resolveOrder = resolveOrder

      if (defaultValueIsVar) {
        varData.defaultValueIsVar = defaultValueIsVar
      }

      if (typeof hasResolvedFallback !== 'undefined') {
        varData.defaultValue = hasResolvedFallback
      }

      if (defaultValueSrc) {
        varData.defaultValueSrc = defaultValueSrc
      }

      if (typeof varData.defaultValue === 'undefined') {
        varData.isRequired = true
      }

      if (varData.resolveOrder.length > 1) {
        varData.hasFallback = true
      }

      // Extract file references
      nested.forEach((detail) => {
        // console.log('detail', detail)
        if (detail.variableType && (detail.variableType === 'file' || detail.variableType === 'text')) {
          const extracted = extractFilePath(detail.variable)
          if (extracted) {
            const normalizedPath = normalizePath(extracted.filePath)
            if (!normalizedPath) return

            // Handle variables in file paths - just record the pattern
            if (!fileRefs.includes(normalizedPath)) {
              fileRefs.push(normalizedPath)
            }

            // Check if path contains variables and create glob pattern
            const containsVariables = !!normalizedPath.match(variableSyntax)
            let globPattern
            if (containsVariables) {
              // Replace variable syntax ${...} with * for glob pattern
              globPattern = normalizedPath.replace(variableSyntax, '*')
              if (!fileGlobPatterns.includes(globPattern)) {
                fileGlobPatterns.push(globPattern)
              }
            }

            // Try to pre-resolve inner variables from originalConfig
            let resolvedPath = normalizedPath
            let resolvedVarString = rawValue
            if (containsVariables) {
              const pathResult = resolveInnerVariables(normalizedPath, variableSyntax, displayConfig, dotProp.get)
              const varStringResult = resolveInnerVariables(rawValue, variableSyntax, displayConfig, dotProp.get)

              if (pathResult.didResolve) {
                resolvedPath = normalizePath(pathResult.resolved) || pathResult.resolved
                resolvedVarString = varStringResult.resolved
                preResolvedPaths.add(resolvedPath)
              }
            }

            // Build byConfigPath entry
            const absolutePath = configFilePath
              ? path.resolve(path.dirname(configFilePath), resolvedPath)
              : resolvedPath
            const fileExists = configFilePath ? fs.existsSync(absolutePath) : false

            const configPathEntry = {
              location: configValuePath,
              filePath: absolutePath,
              relativePath: resolvedPath,
              originalVariableString: rawValue,
              resolvedVariableString: resolvedVarString,
              containsVariables,
              exists: fileExists,
            }
            if (globPattern) {
              configPathEntry.pattern = globPattern
            }
            byConfigPath.push(configPathEntry)

            // Build references entry (use resolvedPath as key when available)
            const refKey = resolvedPath
            if (!referencesMap.has(refKey)) {
              referencesMap.set(refKey, {
                resolvedPath: refKey,
                refs: [],
              })
            }
            const refEntry = referencesMap.get(refKey)
            refEntry.refs.push({
              location: configValuePath,
              value: normalizedPath,
              originalVariableString: rawValue,
            })
          }
        }
      })

      variableData[key] = (variableData[key] || []).concat(varData)
      foundVariables.push(rawValue)
    }
  })

  // Make foundVariables array unique
  const finalFoundVariables = [...new Set(foundVariables)]
  const varKeys = Object.keys(variableData)

  // Calculate summary using same logic as CLI display
  let requiredCount = 0
  let withDefaultsCount = 0
  varKeys.forEach((key) => {
    const instances = variableData[key]
    const firstInstance = instances[0]

    // Extract variable name from key (e.g. "${self:service}" -> "self:service")
    const keyVarName = key.slice(2, -1).split(',')[0].trim()

    // Find the resolveDetail that matches THIS variable (not any self-ref in the string)
    let matchingDetail = null
    for (const instance of instances) {
      if (instance.resolveDetails && instance.resolveDetails.length > 0) {
        const found = instance.resolveDetails.find((detail) => {
          const detailVar = detail.valueBeforeFallback || detail.variable
          return detailVar === keyVarName
        })
        if (found && (found.variableType === 'dot.prop' || found.variableType === 'self')) {
          matchingDetail = found
          break
        }
      }
    }

    // Also check defaultValueIsVar
    if (!matchingDetail && firstInstance.defaultValueIsVar && (
      firstInstance.defaultValueIsVar.variableType === 'self:' ||
      firstInstance.defaultValueIsVar.variableType === 'dot.prop'
    )) {
      matchingDetail = firstInstance.defaultValueIsVar
    }

    // Check if truly required
    let isTrulyRequired = false
    if (matchingDetail) {
      // Check if the self-reference resolves to a value
      // Use valueBeforeFallback if present (strips inline fallback like ", false")
      const varPath = matchingDetail.valueBeforeFallback || matchingDetail.variable
      const cleanPath = varPath.replace('self:', '')
      const dotPropValue = dotProp.get(originalConfig, cleanPath)
      if (typeof dotPropValue === 'undefined') {
        isTrulyRequired = true
      } else {
        // Enrich ALL instances with resolved self-reference value (overrides inline fallbacks)
        instances.forEach((instance) => {
          instance.defaultValueSrc = cleanPath
          instance.defaultValue = dotPropValue
          instance.isRequired = false
        })
      }
    } else if (typeof firstInstance.defaultValue === 'undefined') {
      isTrulyRequired = true
    }

    // Update isRequired based on computed isTrulyRequired
    instances.forEach((instance) => {
      instance.isRequired = isTrulyRequired
    })

    if (isTrulyRequired) {
      requiredCount++
    } else {
      withDefaultsCount++
    }
  })

  return {
    variables: variableData,
    uniqueVariables: {},
    fileDependencies: {
      globPatterns: fileGlobPatterns,
      // all: fileRefs,
      dynamicPaths: fileRefs.filter(ref => ref.indexOf('*') !== -1 || ref.match(variableSyntax)),
      // Resolved paths: static paths + pre-resolved dynamic paths
      resolvedPaths: [
        ...fileRefs.filter(ref => ref.indexOf('*') === -1 && !ref.match(variableSyntax)),
        ...preResolvedPaths
      ],
      byConfigPath,
      references: Array.from(referencesMap.values()),
    },
    summary: {
      totalVariables: varKeys.length,
      requiredVariables: requiredCount,
      variablesWithDefaults: withDefaultsCount
    },
  }
}

module.exports = { collectVariableMetadata }
