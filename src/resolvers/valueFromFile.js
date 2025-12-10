/**
 * Resolves values from file references (file() and text() syntax)
 */
const fs = require('fs')
const { trim } = require('../utils/lodash')
const { splitCsv } = require('../utils/strings/splitCsv')
const { resolveFilePathFromMatch, resolveFilePath } = require('../utils/paths/getFullFilePath')
const { findNestedVariables } = require('../utils/variables/findNestedVariables')
const { makeBox } = require('@davidwells/box-logger')
const { encodeJsSyntax, decodeJsonInVariable, hasEncodedJson } = require('../utils/encoders/js-fixes')

/* File Parsers */
const YAML = require('../parsers/yaml')
const TOML = require('../parsers/toml')
const INI = require('../parsers/ini')
const JSON5 = require('../parsers/json5')

/**
 * Recursively clean encoded JSON from an object
 * @param {*} obj - Object to clean
 * @returns {*} Cleaned object
 */
function cleanEncodedJson(obj) {
  if (!obj) return obj
  if (typeof obj === 'string') {
    return decodeJsonInVariable(obj)
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanEncodedJson)
  }
  if (typeof obj === 'object') {
    const cleaned = {}
    for (const key of Object.keys(obj)) {
      cleaned[key] = cleanEncodedJson(obj[key])
    }
    return cleaned
  }
  return obj
}

/**
 * Parse file contents based on file extension
 * @param {string} content - Raw file contents
 * @param {string} filePath - File path (used to determine extension)
 * @returns {*} Parsed content
 */
function parseFileContents(content, filePath) {
  const ext = filePath.split('.').pop().toLowerCase()

  if (ext === 'json' || ext === 'json5') {
    return JSON5.parse(content)
  }
  if (ext === 'yml' || ext === 'yaml') {
    return YAML.parse(content)
  }
  if (ext === 'toml' || ext === 'tml') {
    return TOML.parse(content)
  }
  if (ext === 'ini') {
    return INI.parse(content)
  }

  // Return raw content for other files
  return content
}

/**
 * Resolves a value from a file reference
 * @param {object} ctx - Context object with instance properties
 * @param {string} ctx.configPath - Base path for file resolution
 * @param {Array} ctx.fileRefsFound - Mutable array tracking file refs
 * @param {RegExp} ctx.variableSyntax - Regex for variable syntax
 * @param {object} ctx.variablesKnownTypes - Known variable types
 * @param {object} ctx.variableTypes - Variable types
 * @param {object} ctx.opts - Options object
 * @param {object} ctx.originalConfig - Original config
 * @param {object} ctx.config - Current config
 * @param {Function} ctx.getDeeperValue - Method for nested lookups
 * @param {RegExp} ctx.fileRefSyntax - Regex for file() syntax
 * @param {RegExp} ctx.textRefSyntax - Regex for text() syntax
 * @param {string} variableString - The variable string to resolve
 * @param {object} options - Resolution options
 * @returns {Promise<any>}
 */
async function getValueFromFile(ctx, variableString, options) {
  const opts = options || {}
  const syntax = opts.asRawText ? ctx.textRefSyntax : ctx.fileRefSyntax
  // console.log('From file', `"${variableString}"`)
  let matchedFileString = variableString.match(syntax)[0]
  // console.log('matchedFileString', matchedFileString)

  // Get function input params if any supplied https://regex101.com/r/qlNFVm/1
  // var funcParamsRegex = /(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/g
  var funcParamsRegex = /(\w+)\s*\(((?:[^()]+)*)?\s*\)/g
  // tighter (?<![.\w-])\b(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*
  var hasParams = funcParamsRegex.exec(matchedFileString)

  let argsToPass = []
  if (hasParams) {
    const splitter = splitCsv(hasParams[2])
    const argsFound = splitter.map((arg) => {
      const cleanArg = trim(arg).replace(/^'|"/, '').replace(/'|"$/, '')
      return cleanArg
    })
    // console.log('argsFound', argsFound)

    // If function has more arguments than file path
    if (argsFound.length && argsFound.length > 1) {
      matchedFileString = argsFound[0]
      argsToPass = argsFound.filter((arg, i) => {
        return i !== 0
      }).map((arg) => {
        // Decode base64-encoded JSON objects passed as args
        if (hasEncodedJson(arg)) {
          const decoded = decodeJsonInVariable(arg)
          try {
            return JSON.parse(decoded)
          } catch (e) {
            return decoded
          }
        }
        return arg
      })
    }
  }
  // console.log('argsToPass', argsToPass)

  const fileDetails = resolveFilePathFromMatch(matchedFileString, syntax, ctx.configPath)
  // console.log('fileDetails', fileDetails)

  let { fullFilePath, resolvedPath, relativePath } = fileDetails

  // Check for file path overrides
  let wasOverridden = false
  let originalFilePath = null
  const filePathOverrides = ctx.opts && ctx.opts.filePathOverrides
  if (filePathOverrides) {
    // Try matching against relativePath (e.g., './env.yml')
    const overrideKey = Object.keys(filePathOverrides).find((key) => {
      // Normalize paths for comparison
      const normalizedKey = key.replace(/^\.\//, '')
      const normalizedRelPath = relativePath.replace(/^\.\//, '')
      return normalizedKey === normalizedRelPath || key === relativePath
    })

    if (overrideKey) {
      originalFilePath = fullFilePath
      const overridePath = filePathOverrides[overrideKey]
      // Resolve the override path (could be relative or absolute)
      fullFilePath = resolveFilePath(overridePath, ctx.configPath)
      resolvedPath = overridePath
      wasOverridden = true
    }
  }

  const exists = fs.existsSync(fullFilePath)

  const fileRefEntry = {
    filePath: fullFilePath,
    relativePath,
    resolvedVariableString: options.context.value,
    originalVariableString: options.context.originalSource,
    containsVariables: options.context.value !== options.context.originalSource,
    exists,
  }

  if (wasOverridden) {
    fileRefEntry.wasOverridden = true
    fileRefEntry.originalFilePath = originalFilePath
  }

  ctx.fileRefsFound.push(fileRefEntry)

  const fileExtParts = resolvedPath.split('.')
  const fileExtension = fileExtParts[fileExtParts.length - 1].toLowerCase()

  // Validate file exists
  if (!exists) {
    const originalVar = options.context && options.context.originalSource

    const findNestedResult = findNestedVariables(
      originalVar,
      ctx.variableSyntax,
      ctx.variablesKnownTypes,
      options.context.path,
      ctx.variableTypes
    )
    // console.log('findNestedResult', findNestedResult)
    let hasFallback = false
    if (findNestedResult) {
      const varDetails = findNestedResult[0]
      // console.log('varDetails', varDetails)
      hasFallback = varDetails.hasFallback
    }

    // check if original var has fallback value
    // console.log('NO FILE FOUND', fullFilePath)
    // console.log('variableString', variableString)

    // Check if file refs are allowed to pass through unresolved
    const allowUnresolved = ctx.opts.allowUnresolvedVariables
    const isFileAllowed = allowUnresolved === true ||
      (Array.isArray(allowUnresolved) && allowUnresolved.includes('file')) ||
      ctx.opts.allowUnknownFileRefs // backward compat

    if (!hasFallback && !isFileAllowed) {
      const errorMsg = makeBox({
        title: `File Not Found in ${originalVar}`,
        minWidth: '100%',
        content: `Variable ${variableString} cannot resolve due to missing file.

File not found ${fullFilePath}

Default fallback value will be used if provided.

${JSON.stringify(options.context, null, 2)}`,
      })
      console.log(errorMsg)
    }
    // TODO maybe reject. YAML does not allow for null/undefined values
    // return Promise.reject(new Error(errorMsg))
    return Promise.resolve(undefined)
  }

  let valueToPopulate

  const variableFileContents = fs.readFileSync(fullFilePath, 'utf-8')

  /* handle case for referencing raw JS files to inline them */
  if (argsToPass.length
    && (argsToPass && argsToPass[0] && argsToPass[0].toLowerCase() === 'raw')
    || opts.asRawText
  ) {
    // Encode foo() to foo__PH_PAREN_OPEN__) to avoid function collisions
    valueToPopulate = encodeJsSyntax(variableFileContents)
    return Promise.resolve(valueToPopulate)
  }

  // Clean encoded JSON from currentConfig for cleaner context
  const cleanedCurrentConfig = cleanEncodedJson(ctx.config)

  // Build context for executable files
  const valueForFunction = {
    options: ctx.opts.options || {},
    originalConfig: ctx.originalConfig,
    currentConfig: cleanedCurrentConfig,
    argsToPass,
    // maybe helper fns
    // maybe the lib instance itself for nested lookups
  }

  // Process JS files
  if (fileExtension === 'js' || fileExtension === 'cjs') {
    const jsFile = require(fullFilePath)
    const { moduleName } = parseModuleReference(variableString, matchedFileString)
    // For default export functions with :property syntax, keep the function and use deep properties
    // For named exports (non-function module), look up the named export
    let returnValueFunction = jsFile
    let includeFirstProperty = false

    if (moduleName && typeof jsFile === 'function') {
      // Default export function with property access - include first property in path
      returnValueFunction = jsFile
      includeFirstProperty = true
    } else if (moduleName) {
      // Named export - look it up directly
      returnValueFunction = jsFile[moduleName]
    }

    return processExecutableFile({
      fileModule: jsFile,
      returnValueFunction,
      valueForFunction,
      argsToPass,
      variableString,
      matchedFileString,
      relativePath,
      fileType: 'javascript',
      getDeeperValue: ctx.getDeeperValue,
      includeFirstProperty
    })
  }

  if (fileExtension === 'ts' || fileExtension === 'tsx' || fileExtension === 'mts' || fileExtension === 'cts') {
    const { executeTypeScriptFile } = require('../parsers/typescript')
    const { moduleName } = parseModuleReference(variableString, matchedFileString)

    try {
      const tsFile = await executeTypeScriptFile(fullFilePath, { dynamicArgs: () => argsToPass })
      let returnValueFunction = tsFile.config || tsFile.default || tsFile
      // For default export functions with :property syntax, keep the function and use deep properties
      // For named exports (non-function module), look up the named export
      let includeFirstProperty = false
      if (moduleName && typeof returnValueFunction !== 'function') {
        returnValueFunction = tsFile[moduleName]
      } else if (moduleName && typeof returnValueFunction === 'function') {
        // Default export function with property access - include first property in path
        includeFirstProperty = true
      }

      return processExecutableFile({
        fileModule: tsFile,
        returnValueFunction,
        valueForFunction,
        argsToPass,
        variableString,
        matchedFileString,
        relativePath,
        fileType: 'TypeScript',
        getDeeperValue: ctx.getDeeperValue,
        includeFirstProperty
      })
    } catch (err) {
      return Promise.reject(new Error(`Error processing TypeScript file: ${err.message}`))
    }
  }

  if (fileExtension === 'mjs' || fileExtension === 'esm') {
    const { executeESMFile } = require('../parsers/esm')
    const { moduleName } = parseModuleReference(variableString, matchedFileString)

    try {
      const esmFile = await executeESMFile(fullFilePath, { dynamicArgs: () => argsToPass })
      let returnValueFunction = esmFile.config || esmFile.default || esmFile
      // For default export functions with :property syntax, keep the function and use deep properties
      // For named exports (non-function module), look up the named export
      let includeFirstProperty = false
      if (moduleName && typeof returnValueFunction !== 'function') {
        returnValueFunction = esmFile[moduleName]
      } else if (moduleName && typeof returnValueFunction === 'function') {
        // Default export function with property access - include first property in path
        includeFirstProperty = true
      }

      return processExecutableFile({
        fileModule: esmFile,
        returnValueFunction,
        valueForFunction,
        argsToPass,
        variableString,
        matchedFileString,
        relativePath,
        fileType: 'ESM',
        getDeeperValue: ctx.getDeeperValue,
        includeFirstProperty
      })
    } catch (err) {
      return Promise.reject(new Error(`Error processing ESM file: ${err.message}`))
    }
  }

  // Process everything except JS, TS, and ESM
  if (fileExtension !== 'js' && fileExtension !== 'ts' && fileExtension !== 'mjs' && fileExtension !== 'esm') {
    /* Read initial file */
    valueToPopulate = variableFileContents

    // File reference has :subKey lookup. Must dig deeper
    if (matchedFileString !== variableString) {
      if (fileExtension === 'yml' || fileExtension === 'yaml') {
        valueToPopulate = JSON.stringify(YAML.parse(valueToPopulate))
      }
      if (fileExtension === 'toml' || fileExtension === 'tml') {
        valueToPopulate = JSON.stringify(TOML.parse(valueToPopulate))
      }
      if (fileExtension === 'ini') {
        valueToPopulate = INI.toJson(valueToPopulate)
      }
      // console.log('deep', variableString)
      // console.log('matchedFileString', matchedFileString)
      const deepPropertiesStr = variableString.replace(matchedFileString, '')
      // Support both : and . as the separator for sub properties
      const firstChar = deepPropertiesStr.substring(0, 1)
      if (firstChar !== ':' && firstChar !== '.') {
        const errorMessage = `Invalid variable syntax when referencing file "${relativePath}" sub properties
Please use ":" or "." to reference sub properties. ${deepPropertiesStr}`
        return Promise.reject(new Error(errorMessage))
      }
      const deepProperties = deepPropertiesStr.slice(1).split('.')
      return ctx.getDeeperValue(deepProperties, valueToPopulate)
    }

    if (fileExtension === 'yml' || fileExtension === 'yaml') {
      valueToPopulate = YAML.parse(valueToPopulate)
      return Promise.resolve(valueToPopulate)
    }

    if (fileExtension === 'toml' || fileExtension === 'tml') {
      valueToPopulate = TOML.parse(valueToPopulate)
      return Promise.resolve(valueToPopulate)
    }

    if (fileExtension === 'ini') {
      valueToPopulate = INI.parse(valueToPopulate)
      return Promise.resolve(valueToPopulate)
    }

    if (fileExtension === 'json' || fileExtension === 'json5') {
      valueToPopulate = JSON5.parse(valueToPopulate)
      return Promise.resolve(valueToPopulate)
    }
  }
  // console.log('fall thru', valueToPopulate)
  return Promise.resolve(valueToPopulate)
}

/**
 * Parses variable string to extract module reference path
 * Supports both : and . as separators for module references
 * @param {string} variableString - The full variable string
 * @param {string} matchedFileString - The matched file path portion
 * @returns {{ variableArray: string[], moduleName: string|null }}
 */
function parseModuleReference(variableString, matchedFileString) {
  let variableArray = variableString.split(':')
  if (variableArray.length === 1) {
    const dotIndex = variableString.indexOf(matchedFileString) + matchedFileString.length
    const afterMatch = variableString.substring(dotIndex)
    if (afterMatch.startsWith('.')) {
      variableArray = [variableString.substring(0, dotIndex), afterMatch.substring(1)]
    }
  }

  let moduleName = null
  if (variableArray[1]) {
    moduleName = variableArray[1].split('.')[0]
  }

  return { variableArray, moduleName }
}

/**
 * Extracts deep properties from variable string after file match
 * @param {string} variableString - The full variable string
 * @param {string} matchedFileString - The matched file path portion
 * @param {boolean} [includeFirstProperty=false] - Include first property (for default exports)
 * @returns {string[]} Array of property keys to traverse
 */
function extractDeepProperties(variableString, matchedFileString, includeFirstProperty = false) {
  const deepPropertiesStr = variableString.replace(matchedFileString, '')
  if (!deepPropertiesStr || deepPropertiesStr === '') {
    return []
  }
  const deepProperties = deepPropertiesStr.slice(1).split('.')
  // For named exports, skip first property (it's the module name)
  // For default exports, keep all properties
  if (!includeFirstProperty) {
    deepProperties.splice(0, 1)
  }
  return deepProperties.map((prop) => trim(prop)).filter(Boolean)
}

/**
 * Processes executable file (JS/TS/ESM) and resolves deep properties
 * @param {object} params - Parameters
 * @param {object} params.fileModule - The loaded module
 * @param {Function} params.returnValueFunction - The function to call
 * @param {object} params.valueForFunction - Context passed to the function
 * @param {string[]} params.argsToPass - Additional args for the function
 * @param {string} params.variableString - Original variable string
 * @param {string} params.matchedFileString - Matched file path
 * @param {string} params.relativePath - Relative file path for errors
 * @param {string} params.fileType - Type of file (javascript/TypeScript/ESM)
 * @param {Function} params.getDeeperValue - Function to resolve nested values
 * @param {boolean} [params.includeFirstProperty=false] - Include first property in path (for default exports)
 * @returns {Promise<any>}
 */
async function processExecutableFile({
  fileModule,
  returnValueFunction,
  valueForFunction,
  argsToPass,
  variableString,
  matchedFileString,
  relativePath,
  fileType,
  getDeeperValue,
  includeFirstProperty = false
}) {
  if (typeof returnValueFunction !== 'function') {
    const errorMessage = `Invalid variable syntax when referencing file "${relativePath}".
Check if your ${fileType} is exporting a function that returns a value.`
    return Promise.reject(new Error(errorMessage))
  }

  const valueToPopulate = returnValueFunction.call(fileModule, ...argsToPass, valueForFunction)

  return Promise.resolve(valueToPopulate).then((valueToPopulateResolved) => {
    const deepProperties = extractDeepProperties(variableString, matchedFileString, includeFirstProperty)
    return getDeeperValue(deepProperties, valueToPopulateResolved).then((deepValueToPopulateResolved) => {
      if (typeof deepValueToPopulateResolved === 'undefined') {
        const errorMessage = `Invalid variable syntax when referencing file "${relativePath}".
Check if your ${fileType} is returning the correct data.`
        return Promise.reject(new Error(errorMessage))
      }
      return Promise.resolve(deepValueToPopulateResolved)
    })
  })
}

module.exports = {
  getValueFromFile,
  parseFileContents,
  parseModuleReference,
  extractDeepProperties
}
