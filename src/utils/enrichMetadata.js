const { splitCsv } = require('./splitCsv')
const dotProp = require('dot-prop')
const fs = require('fs')
const path = require('path')

/**
 * Create a standardized occurrence object
 * @param {object} instance - The variable instance from metadata
 * @param {string} varMatch - The variable match string
 * @param {object} options - Optional override values
 * @returns {object} Standardized occurrence object
 */
function createOccurrence(instance, varMatch, options = {}) {
  const occurrence = {
    originalString: instance.originalStringValue,
    varMatch: varMatch,
    path: instance.path,
    filters: instance.filters,
    defaultValue: options.defaultValue !== undefined ? options.defaultValue : instance.defaultValue,
    isRequired: options.isRequired !== undefined ? options.isRequired : instance.isRequired,
    hasFilters: !!(instance.filters && instance.filters.length > 0),
    hasFallback: options.hasFallback !== undefined ? options.hasFallback : (instance.hasFallback || false),
  }

  if (instance.defaultValueSrc) {
    occurrence.defaultValueSrc = instance.defaultValueSrc
  }

  return occurrence
}

/**
 * Extract file path from a file() or text() reference string
 * @param {string} propertyString - The property string containing file/text reference
 * @returns {object|null} Object with filePath, or null if no match
 */
function extractFilePath(propertyString) {
  const fileMatch = propertyString.match(/^\$\{(?:file|text)\((.*?)\)/)
  if (!fileMatch || !fileMatch[1]) {
    return null
  }
  
  const fileContent = fileMatch[1].trim()
  const parts = splitCsv(fileContent)
  let filePath = parts[0].trim()
  
  // Remove quotes if present
  filePath = filePath.replace(/^['"]|['"]$/g, '')
  
  return { filePath }
}

/**
 * Normalize a file path (add ./ prefix, fix .//, skip deep refs)
 * @param {string} filePath - The file path to normalize
 * @returns {string|null} Normalized path, or null if should be skipped
 */
function normalizePath(filePath) {
  // Skip deep references
  if (filePath.includes('deep:')) {
    return null
  }
  
  let normalized = filePath
  
  // Add ./ prefix for relative paths
  if (!filePath.startsWith('./') && 
      !filePath.startsWith('../') && 
      !filePath.startsWith('/') && 
      !filePath.startsWith('~')) {
    normalized = './' + filePath
  }
  
  // Fix double slashes
  if (normalized.startsWith('.//')) {
    normalized = normalized.replace('.//', './')
  }
  
  return normalized
}

/**
 * Enriches variable metadata with resolution tracking data.
 * @param {object} metadata - The metadata object from collectVariableMetadata.
 * @param {object} resolutionTracking - The resolution tracking data from Configorama instance.
 * @param {RegExp} variableSyntax - The variable syntax regex.
 * @param {Array} fileRefsFound - The (incomplete) list of file refs found during resolution.
 * @param {object} originalConfig - The original config object (before resolution) for self/dot.prop lookups.
 * @returns {object} Enriched metadata with resolution details and a complete file reference list.
 */
function enrichMetadata(
  metadata, 
  resolutionTracking, 
  variableSyntax, 
  fileRefsFound = [], 
  originalConfig = {},
  configPath
) {
  if (!resolutionTracking) {
    return metadata
  }

  const varKeys = Object.keys(metadata.variables)

  for (const key of varKeys) {
    const varInstances = metadata.variables[key]

    for (const varData of varInstances) {
      const pathKey = varData.path
      const trackingData = resolutionTracking[pathKey]

      if (trackingData && trackingData.resolutionHistory && varData.resolveDetails) {
        // For each resolveDetail, find the matching resolution history entry
        for (let i = 0; i < varData.resolveDetails.length; i++) {
          const detail = varData.resolveDetails[i]
          const isOutermost = i === varData.resolveDetails.length - 1

          if (isOutermost && trackingData.resolutionHistory.length > 0) {
            // For the outermost variable, use the last resolution history entry's result
            const lastEntry = trackingData.resolutionHistory[trackingData.resolutionHistory.length - 1]
            if (lastEntry.result !== undefined) {
              detail.resolvedValue = lastEntry.result
            }
          } else {
            // For inner variables, try to find a matching resolution history entry
            for (const historyEntry of trackingData.resolutionHistory) {
              const historyVar = historyEntry.variable
              const detailVar = detail.variable

              if (historyVar === detailVar || historyVar.includes(detail.varString)) {
                if (historyEntry.result !== undefined) {
                  // detail.resolvedValue = historyEntry.result
                  let resolvedValue = historyEntry.result
                  // If result is a deep reference, look for the resolved value
                  if (typeof resolvedValue === 'string' && resolvedValue.match(/^\$\{deep:\d+\}$/)) {
                    const deepVar = resolvedValue.slice(2, -1) // e.g. "deep:1"
                    const deepEntry = trackingData.resolutionHistory.find(e => e.variable === deepVar)
                    if (deepEntry && deepEntry.result !== undefined) {
                      resolvedValue = deepEntry.result
                      historyEntry.resultAfterDeep = resolvedValue
                    }
                  }
                  detail.resolvedValue = resolvedValue
                }
                break
              }
            }
          }
        }
      }
    }
  }

  // Build resolvedFileRefs array from tracking data
  const resolvedFileRefs = []
  const normalizedPaths = new Set()

  for (const pathKey in resolutionTracking) {
    const tracking = resolutionTracking[pathKey]
    if (tracking.calls && tracking.calls.length) {
      const lastCall = tracking.calls[tracking.calls.length - 1]

      const extracted = extractFilePath(lastCall.propertyString)
      if (extracted) {
        const normalizedPath = normalizePath(extracted.filePath)

        if (normalizedPath && !normalizedPaths.has(normalizedPath)) {
          normalizedPaths.add(normalizedPath)
          resolvedFileRefs.push(normalizedPath)
        }
      }
    }
  }

  // Update fileDependencies.resolvedPaths with the resolved file refs
  if (metadata.fileDependencies) {
    metadata.fileDependencies.resolvedPaths = resolvedFileRefs
  }

  // Build references array
  const resolvedFileRefsDataMap = new Map()

  // First Pass: Collect all refs and attach glob patterns directly to each ref.
  for (const pathKey in resolutionTracking) {
    const tracking = resolutionTracking[pathKey]
    if (!tracking.calls || !tracking.calls.length) continue
    
    const lastCall = tracking.calls[tracking.calls.length - 1]
    const extracted = extractFilePath(lastCall.propertyString)
    if (!extracted) continue
    
    const resolvedPath = normalizePath(extracted.filePath)
    if (!resolvedPath) continue
    
    const originalPropertyString = tracking.originalPropertyString
    if (!originalPropertyString) continue
    
    const origExtracted = extractFilePath(originalPropertyString)
    if (!origExtracted) continue
    
    const origPath = normalizePath(origExtracted.filePath)
    if (!origPath) continue
    
    // Initialize map entry if needed
    if (!resolvedFileRefsDataMap.has(resolvedPath)) {
      resolvedFileRefsDataMap.set(resolvedPath, {
        resolvedPath: resolvedPath,
        refs: [],
      })
    }
    
    const entry = resolvedFileRefsDataMap.get(resolvedPath)
    
    const alreadyExists = entry.refs.some(ref => ref.path === pathKey && ref.value === origPath)
    if (!alreadyExists) {
      const refEntry = { 
        location: pathKey, 
        value: origPath,
        originalVariableString: originalPropertyString,
      }
      
      // Check for inner variables and generate glob pattern for this specific ref
      if (variableSyntax && origPath.match(variableSyntax)) {
        refEntry.hasInnerVariable = true
        refEntry.pattern = origPath.replace(variableSyntax, '*')
      }
      
      entry.refs.push(refEntry)
    }
  }
  
  // Second Pass: Aggregate glob patterns for the top-level 'allGlobPatterns' summary.
  for (const data of resolvedFileRefsDataMap.values()) {
    const allGlobs = new Set()
    for (const ref of data.refs) {
      if (ref.pattern) {
        allGlobs.add(ref.pattern)
      }
    }
    if (allGlobs.size > 0) {
      data.globPatterns = Array.from(allGlobs)
    }
  }
  
  // Convert map to array for the final metadata object.
  const references = Array.from(resolvedFileRefsDataMap.values())

  // Build the complete, flat list of all file references
  const fileDetailsMap = new Map()
  for (const fileRef of fileRefsFound) {
    if (!fileDetailsMap.has(fileRef.relativePath)) {
      fileDetailsMap.set(fileRef.relativePath, fileRef)
    }
  }

  const byConfigPath = []
  if (references.length > 0) {
    for (const resolvedFileData of references) {
      const details = fileDetailsMap.get(resolvedFileData.resolvedPath)
      if (details) {
        for (const ref of resolvedFileData.refs) {
          const confDetails = {
            location: ref.location,
            filePath: details.filePath,
            relativePath: details.relativePath,
            originalVariableString: ref.originalVariableString,
            resolvedVariableString: details.resolvedVariableString,
            containsVariables: !!ref.hasInnerVariable,
            exists: details.exists,
            // Get glob patterns from the individual ref, default to empty array
            
          }
          if (ref.pattern) {
            confDetails.pattern = ref.pattern
          }
          byConfigPath.push(confDetails)
        }
      }
    }
  }

  // Update fileDependencies with the enriched data
  if (metadata.fileDependencies) {
    metadata.fileDependencies.byConfigPath = byConfigPath
    metadata.fileDependencies.references = references
  }

  // Build uniqueVariables rollup - group by base variable (without fallbacks)
  const uniqueVariablesMap = new Map()

  for (const key of varKeys) {
    const varInstances = metadata.variables[key]
    const firstInstance = varInstances[0]
    const lastResolveDetail = firstInstance.resolveDetails[firstInstance.resolveDetails.length - 1]

    // Get the base variable name without fallback
    // Use valueBeforeFallback if present, otherwise use the variable string
    let baseVar = lastResolveDetail.valueBeforeFallback || lastResolveDetail.variable

    // Normalize file() and text() references
    if (baseVar.match(/^(?:file|text)\(/)) {
      // Strip sub-key accessors like :topLevel, :nested.value, etc.
      baseVar = baseVar.replace(/:[\w.[\]]+$/, '')

      // Normalize path - remove quotes and ensure it starts with ./
      baseVar = baseVar.replace(/^(file|text)\((.+?)\)/, (match, funcName, filePath) => {
        // Remove surrounding quotes (single or double)
        let cleanPath = filePath.trim().replace(/^["']|["']$/g, '')

        // Use normalizePath for consistent normalization (handles ./, .// etc)
        const normalized = normalizePath(cleanPath)
        if (normalized) {
          return `${funcName}(${normalized})`
        }

        return match
      })
    }

    if (!uniqueVariablesMap.has(baseVar)) {
      uniqueVariablesMap.set(baseVar, {
        variable: baseVar,
        variableType: lastResolveDetail.variableType,
        occurrences: [],
        innerVariables: [],
      })
    }

    const entry = uniqueVariablesMap.get(baseVar)

    // Collect inner variables from resolveDetails (variables nested inside this variable)
    const innerVarsSet = new Set((entry.innerVariables || []).map(v => v.variable))

    for (const instance of varInstances) {
      // Add this occurrence with its full context
      const occurrence = createOccurrence(instance, key)
      entry.occurrences.push(occurrence)

      // Find inner variables in resolveDetails (excluding the outermost variable itself)
      if (instance.resolveDetails && instance.resolveDetails.length > 1) {
        // The outermost variable is the last one in resolveDetails
        const outermostDetail = instance.resolveDetails[instance.resolveDetails.length - 1]

        for (let i = 0; i < instance.resolveDetails.length - 1; i++) {
          const detail = instance.resolveDetails[i]

          // Check if this variable is actually INSIDE the outermost variable's boundaries
          // A variable is "inner" only if it's contained within the parent's start/end range
          const isInnerVariable = detail.start >= outermostDetail.start && detail.end <= outermostDetail.end

          if (!isInnerVariable) {
            // This is a sibling variable at the same level, not an inner variable
            // But we should still add it as its own uniqueVariables entry
            const siblingBaseVar = detail.valueBeforeFallback || detail.variable

            // Normalize file/text references for sibling too
            let normalizedSiblingVar = siblingBaseVar
            if (normalizedSiblingVar.match(/^(?:file|text)\(/)) {
              // Strip sub-key accessor (e.g., :foo from file(./_inner.yml):foo)
              normalizedSiblingVar = normalizedSiblingVar.replace(/:[\w.[\]]+$/, '')

              normalizedSiblingVar = normalizedSiblingVar.replace(/^(file|text)\((.+?)\)/, (match, funcName, filePath) => {
                let cleanPath = filePath.trim().replace(/^["']|["']$/g, '')
                const normalized = normalizePath(cleanPath)
                return normalized ? `${funcName}(${normalized})` : match
              })
            }

            // Create or get entry for this sibling variable
            if (!uniqueVariablesMap.has(normalizedSiblingVar)) {
              uniqueVariablesMap.set(normalizedSiblingVar, {
                variable: normalizedSiblingVar,
                variableType: detail.variableType,
                occurrences: [],
                innerVariables: [],
              })
            }

            const siblingEntry = uniqueVariablesMap.get(normalizedSiblingVar)

            // Add occurrence for this sibling variable
            const siblingOccurrence = createOccurrence(instance, detail.varMatch, {
              isRequired: !detail.hasFallback,
              hasFallback: !!detail.hasFallback,
              defaultValue: detail.hasFallback ? (detail.fallbackValues?.[0]?.stringValue || detail.fallbackValues?.[0]?.variable) : undefined,
            })

            // Check if this exact occurrence already exists
            const occurrenceExists = siblingEntry.occurrences.some(occ =>
              occ.varMatch === siblingOccurrence.varMatch &&
              occ.path === siblingOccurrence.path
            )

            if (!occurrenceExists) {
              siblingEntry.occurrences.push(siblingOccurrence)
            }

            continue
          }

          // Get base variable (without fallback)
          const innerBaseVar = detail.valueBeforeFallback || detail.variable

          if (innerBaseVar && !innerVarsSet.has(innerBaseVar)) {
            innerVarsSet.add(innerBaseVar)

            let isRequired = !detail.hasFallback
            let defaultValue = detail.hasFallback ? (detail.fallbackValues?.[0]?.stringValue || detail.fallbackValues?.[0]?.variable) : undefined
            let defaultValueSrc
            let hasValue = false

            // For self: and dot.prop, check if value exists in original config
            if (detail.variableType === 'self' || detail.variableType === 'dot.prop') {
              const cleanPath = innerBaseVar.replace(/^self:/, '')
              const configValue = dotProp.get(originalConfig, cleanPath)

              if (configValue !== undefined) {
                // Check if the value contains variables
                const hasVariables = variableSyntax && typeof configValue === 'string' && configValue.match(variableSyntax)

                if (!hasVariables) {
                  // Static value exists in config
                  hasValue = true
                  defaultValue = typeof configValue === 'object' ? JSON.stringify(configValue) : configValue
                  defaultValueSrc = cleanPath
                }
              }
            }

            const innerVariable = {
              variable: innerBaseVar,
              variableType: detail.variableType,
              isRequired,
              hasValue,
              defaultValue,
            }

            if (defaultValueSrc) {
              innerVariable.defaultValueSrc = defaultValueSrc
            }

            entry.innerVariables.push(innerVariable)
          }
        }
      }
    }

    // Remove innerVariables array if empty
    if (entry.innerVariables && entry.innerVariables.length === 0) {
      delete entry.innerVariables
    }

    // If all inner variables have values, resolve them in the variable string
    if (entry.innerVariables && entry.innerVariables.length > 0) {
      const allHaveValues = entry.innerVariables.every(v => v.hasValue)

      if (allHaveValues) {
        let resolvedVariable = entry.variable

        // Replace each inner variable with its default value
        for (const innerVar of entry.innerVariables) {
          // Match ${varName} or just varName (for dot.prop shorthand)
          const varPattern = innerVar.variableType === 'self'
            ? `\\$\\{self:${innerVar.variable.replace('self:', '')}\\}`
            : `\\$\\{${innerVar.variable}\\}`

          const regex = new RegExp(varPattern, 'g')
          resolvedVariable = resolvedVariable.replace(regex, innerVar.defaultValue)
        }

        // Normalize file paths after variable substitution
        if (resolvedVariable.match(/^(?:file|text)\(/)) {
          resolvedVariable = resolvedVariable.replace(/^(file|text)\((.+?)\)/, (match, funcName, filePath) => {
            const normalized = normalizePath(filePath)
            return normalized ? `${funcName}(${normalized})` : match
          })
        }

        // Update the variable to the resolved version and update map key
        if (resolvedVariable !== baseVar) {
          entry.variable = resolvedVariable
          uniqueVariablesMap.delete(baseVar)

          // Check if the resolved variable already exists in the map (merge if so)
          if (uniqueVariablesMap.has(resolvedVariable)) {
            const existingEntry = uniqueVariablesMap.get(resolvedVariable)
            // Merge occurrences from both entries
            existingEntry.occurrences.push(...entry.occurrences)

            // Merge innerVariables if both have them
            if (entry.innerVariables && entry.innerVariables.length > 0) {
              if (!existingEntry.innerVariables) {
                existingEntry.innerVariables = []
              }
              // Add unique inner variables only
              for (const innerVar of entry.innerVariables) {
                const exists = existingEntry.innerVariables.some(v => v.variable === innerVar.variable)
                if (!exists) {
                  existingEntry.innerVariables.push(innerVar)
                }
              }
            }
          } else {
            uniqueVariablesMap.set(resolvedVariable, entry)
          }
        }
      }
    }
  }

  // Check file existence for file/text variables with fully resolved paths
  for (const [varKey, entry] of uniqueVariablesMap) {
    if (entry.variableType === 'file' || entry.variableType === 'text') {
      // Extract file path from variable string like "file(./config.other.json)"
      const filePathMatch = entry.variable.match(/^(?:file|text)\((.+?)\)/)
      if (filePathMatch) {
        const filePath = filePathMatch[1]

        // Check if the path contains variables (if so, we can't check existence yet)
        const hasVariables = variableSyntax && filePath.match(variableSyntax)

        if (!hasVariables) {
          // Look up in fileRefsFound to see if file exists
          const fileRef = fileRefsFound.find(ref => ref.relativePath === filePath)
          if (fileRef) {
            entry.fileExists = fileRef.exists
          } else if (configPath) {
            const thePath = path.resolve(path.dirname(configPath), filePath)
            const fileExists = fs.existsSync(thePath)
            entry.fileExists = fileExists
          }
        }
      }
    }
  }

  // Convert map to object for metadata
  metadata.uniqueVariables = Object.fromEntries(uniqueVariablesMap)

  return metadata
}

module.exports = enrichMetadata