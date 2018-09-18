const os = require('os')
const path = require('path')
const fs = require('fs')
// TODO only import lodash we need
const _ = require('lodash')
const BbPromise = require('bluebird')
const findUp = require('find-up')
const replaceall = require('replaceall')
// Default Value resolvers
const getValueFromString = require('./resolvers/valueFromString')
const getValueFromNumber = require('./resolvers/valueFromNumber')
const getValueFromEnv = require('./resolvers/valueFromEnv')
const getValueFromOptions = require('./resolvers/valueFromOptions')
// Default File Parsers
const YAML = require('./parsers/yaml')
const TOML = require('./parsers/toml')
// Utility functions
const splitByComma = require('./utils/splitByComma')
const cleanVariable = require('./utils/cleanVariable')
const appendDeepVariable = require('./utils/appendDeepVariable')
const isValidValue = require('./utils/isValidValue')
const PromiseTracker = require('./utils/PromiseTracker')

/**
 * Maintainer's notes:
 *
 * This is a tricky class to modify and maintain.  A few rules on how it works...
 *
 * 1. All variable populations occur in generations.  Each of these generations resolves each
 *   present variable in the given object or property (i.e. terminal string properties and/or
 *   property parts) once.  This is to say that recursive resolutions should not be made.  This is
 *   because cyclic references are allowed [i.e. ${self:} and the like]) and doing so leads to
 *   dependency and dead-locking issues.  This leads to a problem with deep value population (i.e.
 *   populating ${self:foo.bar} when ${self:foo} has a value of {opt:bar}).  To pause that, one must
 *   pause population, noting the continued depth to traverse.  This motivated "deep" variables.
 *   Original issue #4687
 */

const deepRefSyntax = RegExp(/(\${)?deep:\d+(\.[^}]+)*()}?/)
const fileRefSyntax = RegExp(/^file\((~?[a-zA-Z0-9._\-/]+?)\)/g)
const envRefSyntax = RegExp(/^env:/g)
const optRefSyntax = RegExp(/^opt:/g)
const selfRefSyntax = RegExp(/^self:/g)
const logLines = '─────────────────────────────────────────────────'
const DEBUG = false

class Configorama {
  constructor(fileOrObject, opts) {
    const options = opts || {}
    // Set initial config object to populate
    if (typeof fileOrObject === 'object') {
      // set config objects
      this.config = fileOrObject
      // Keep a copy
      this.originalConfig = _.cloneDeep(fileOrObject)
      // Set configPath for file references
      this.configPath = options.configDir || process.cwd()
    } else if (typeof fileOrObject === 'string') {
      // read and parse file
      const fileContents = fs.readFileSync(fileOrObject, 'utf-8')
      const fileDirectory = path.dirname(fileOrObject)
      const fileType = path.extname(fileOrObject)

      let configObject
      if (fileType.match(/\.(yml|yaml)/)) {
        configObject = YAML.parse(fileContents)
      } else if (fileType.match(/\.(toml)/)) {
        configObject = TOML.parse(fileContents)
      } else if (fileType.match(/\.(json)/)) {
        configObject = JSON.parse(fileContents)
      }
      // set config objects
      this.config = configObject
      // Keep a copy
      this.originalConfig = _.cloneDeep(configObject)
      // Set configPath for file references
      this.configPath = fileDirectory
    }

    // Track promise resolution
    this.tracker = new PromiseTracker()

    // TODO more default char matches \${((?!AWS)[ ~:a-zA-Z0-9=+!@#%*<>?._'",\-\/\(\)\\]+?)}
    const defaultSyntax = '\\${((?!AWS)[ ~:a-zA-Z0-9=+!@#%*<>?._\'",\\-\\/\\(\\)\\\\]+?)}'
    const variableSyntax = options.syntax || defaultSyntax

    if (typeof variableSyntax === 'string') {
      this.variableSyntax = RegExp(variableSyntax, 'g')
    } else if (variableSyntax instanceof RegExp) {
      this.variableSyntax = variableSyntax
    }

    // Variable Sources
    this.variableTypes = [
      // Environment variables
      getValueFromEnv,
      // CLi option flags
      getValueFromOptions,
      // Self ref
      {
        match: selfRefSyntax,
        resolver: (varString) => {
          return this.getValueFromSelf(varString)
        }
      },
      // File
      {
        match: fileRefSyntax,
        resolver: (varString) => {
          return this.getValueFromFile(varString)
        }
      },
      // Strings
      getValueFromString,
      // Deep references
      {
        match: deepRefSyntax,
        resolver: (varString) => {
          return this.getValueFromDeep(varString)
        }
      },
      // Numbers
      getValueFromNumber,
      // Nicer Self. Match key in object
      {
        match: (varString, fullObject) => {
          const startOf = varString.split('.')
          return fullObject[startOf[0]]
        },
        resolver: (varString) => {
          return this.getValueFromSelf(varString)
        }
      },
      // Custom
      {
        // match: (val) => {
        //   return val === 'tester:'
        // },
        match: RegExp(/^tester:/g),
        resolver: (varToProcess, opts, currentObject) => {
          console.log('varToProcess', varToProcess)
          console.log('cli flags', opts)
          console.log('currentObject', currentObject)
          return Promise.resolve(`hi ${varToProcess}`)
        }
      },
    ]

    // Apply user defined variable sources
    if (options.variableSources) {
      this.variableTypes = this.variableTypes.concat(options.variableSources)
    }

    this.deep = []
    this.callCount = 0
  }

  initialCall(func) {
    this.deep = []
    this.tracker.start()
    return func().finally(() => {
      this.tracker.stop()
      this.deep = []
    })
  }

  // #############
  // ## Initialize Configuration Population ##
  // #############
  /**
   * Populate all variables in the service, conviently remove and restore the service attributes
   * that confuse the population methods.
   * @param processedOptions An options hive to use for ${opt:...} variables.
   * @returns {Promise.<TResult>|*} A promise resolving to the populated service.
   */
  init(processedOptions) {
    this.options = processedOptions || {}

    return this.initialCall(() => {
      return Promise.resolve().then(() => {
        return this.populateObjectImpl(this.config).finally(() => {
          if (DEBUG) {
            console.log(`Variable process ran ${this.callCount} times`)
            // console.log('FINAL Value', this.config)
          }
        })
      }).then(() => {
        return this.config
      })
    })
  }
  // ############
  // ## OBJECT ##
  // ############
  /**
   * The declaration of a terminal property.  This declaration includes the path and value of the
   * property.
   * Example Input:
   * {
   *   foo: {
   *     bar: 'baz'
   *   }
   * }
   * Example Result:
   * [
   *   {
   *     path: ['foo', 'bar']
   *     value: 'baz
   *   }
   * ]
   * @typedef {Object} TerminalProperty
   * @property {String[]} path The path to the terminal property
   * @property {Date|RegEx|String} The value of the terminal property
   */
  /**
   * Generate an array of objects noting the terminal properties of the given root object and their
   * paths
   * @param root The object to generate a terminal property path/value set for
   * @param current The current part of the given root that terminal properties are being sought
   * within
   * @param [context] An array containing the path to the current object root (intended for internal
   * use)
   * @param [results] An array of current results (intended for internal use)
   * @returns {TerminalProperty[]} The terminal properties of the given root object, with the path
   * and value of each
   */
  getProperties(root, atRoot, current, cntxt, rslts) {
    let context = cntxt
    if (!context) {
      context = []
    }
    let results = rslts
    if (!results) {
      results = []
    }
    const addContext = (value, key) => {
      return this.getProperties(root, false, value, context.concat(key), results)
    }
    if (_.isArray(current)) {
      _.map(current, addContext)
    } else if (_.isObject(current) && !_.isDate(current) && !_.isRegExp(current) && !_.isFunction(current)) {
      if (atRoot || current !== root) {
        _.mapValues(current, addContext)
      }
    } else {
      // TODO Add values to leaves here
      results.push({
        path: context,
        value: current
      })
    }
    return results
  }

  /**
   * @typedef {TerminalProperty} TerminalPropertyPopulated
   * @property {Object} populated The populated value of the value at the path
   */
  /**
   * Populate the given terminal properties, returning promises to do so
   * @param properties The terminal properties to populate
   * @returns {Promise<TerminalPropertyPopulated[]>[]} The promises that will resolve to the
   * populated values of the given terminal properties
   */
  populateVariables(properties) {
    const variables = properties.filter((property) => {
      // console.log('property', property)
      return _.isString(property.value) && property.value.match(this.variableSyntax)
    })
    return _.map(variables, (valueObject) => {
      // console.log('valueObject', valueObject)
      return this.populateValue(valueObject, false)
        .then((populated) => {
          return _.assign({}, valueObject, { populated: populated.value })
        })
    })
  }
  /**
   * Assign the populated values back to the target object
   * @param target The object to which the given populated terminal properties should be applied
   * @param populations The fully populated terminal properties
   * @returns {Promise<number>} resolving with the number of changes that were applied to the given
   * target
   */
  assignProperties(target, populations) { // eslint-disable-line class-methods-use-this
    return Promise.all(populations)
      .then((results) => results.forEach((result) => {
        if (result.value !== result.populated) {
          _.set(target, result.path, result.populated)
        }
      }))
  }
  /**
   * Populate the variables in the given object.
   * @param objectToPopulate The object to populate variables within.
   * @returns {Promise.<TResult>|*} A promise resolving to the in-place populated object.
   */
  populateObject(objectToPopulate) {
    return this.initialCall(() => this.populateObjectImpl(objectToPopulate))
  }
  populateObjectImpl(objectToPopulate) {
    this.callCount = this.callCount + 1
    const leaves = this.getProperties(objectToPopulate, true, objectToPopulate)
    const populations = this.populateVariables(leaves)

    // console.log("FILL LEAVES", populations)

    if (populations.length === 0) {
      if (DEBUG) {
        console.log('Config Population Finished')
      }
      return Promise.resolve(objectToPopulate)
    }

    return this.assignProperties(objectToPopulate, populations).then(() => {
      return this.populateObjectImpl(objectToPopulate)
    })
  }
  // ##############
  // ## PROPERTY ##
  // ##############
  /**
   * @typedef {Object} MatchResult
   * @property {String} match The original property value that matched the variable syntax
   * @property {String} variable The cleaned variable string that specifies the origin for the
   * property value
   */
  /**
   * Get matches against the configured variable syntax
   * @param property The property value to attempt extracting matches from
   * @returns {Object|String|MatchResult[]} The given property or the identified matches
   */
  getMatches(property) {
    if (typeof property !== 'string') {
      return property
    }
    const matches = property.match(this.variableSyntax)
    if (!matches || !matches.length) {
      return property
    }
    return _.map(matches, match => ({
      match,
      variable: cleanVariable(match, this.variableSyntax),
    }))
  }
  /**
   * Populate the given matches, returning an array of Promises which will resolve to the populated
   * values of the given matches
   * @param {MatchResult[]} matches The matches to populate
   * @returns {Promise[]} Promises for the eventual populated values of the given matches
   */
  populateMatches(matches, valueObject) {
    // console.log('matches', matches)
    return _.map(matches, (match) => this.splitAndGet(match.variable, valueObject))
  }
  /**
   * Render the given matches and their associated results to the given value
   * @param value The value into which to render the given results
   * @param matches The matches on the given value where the results are to be rendered
   * @param results The results that are to be rendered to the given value
   * @returns {*} The populated value with the given results rendered according to the given matches
   */
  renderMatches(valueObject, matches, results) {
    // console.log('RENDER', matches)
    // console.log('RESULTS', results)
    let result = valueObject.value
    for (let i = 0; i < matches.length; i += 1) {
      this.warnIfNotFound(matches[i].variable, results[i])
      // console.log('REDNER MATCHES', results[i])
      let valueToPop = results[i]
      // TODO refactor this. __config needed to stop clash with sync/async file resolution
      if (results[i] && typeof results[i] === 'object' && results[i].__config) {
        valueToPop = results[i].value
      }
      result = this.populateVariable(valueObject, matches[i].match, valueToPop)
    }
    return result
  }
  /**
   * Populate the given value, recursively if root is true
   * @param valueObject The value to populate variables within
   * @param root Whether the caller is the root populator and thereby whether to recursively
   * populate
   * @returns {PromiseLike<T>} A promise that resolves to the populated value, recursively if root
   * is true
   */
  populateValue(valueObject, root) {
    if (DEBUG) {
      console.log('─────────────────────────────────────────────▶')
      console.log('>>>>>>>> populateValue')
      console.log(valueObject)
    }
    const property = valueObject.value
    const matches = this.getMatches(property)
    // console.log('matchesmatches', matches)
    if (!_.isArray(matches)) {
      return Promise.resolve(property)
    }
    const populations = this.populateMatches(matches, valueObject)
    return Promise.all(populations)
      .then(results => this.renderMatches(valueObject, matches, results))
      .then((result) => {
        if (root && matches.length) {
          return this.populateValue({ value: result.value }, root)
        }
        return result
      })
  }
  /**
   * Populate variables in the given property.
   * @param propertyToPopulate The property to populate (replace variables with their values).
   * @returns {Promise.<TResult>|*} A promise resolving to the populated result.
   */

  // populateProperty(propertyToPopulate) {
  //   console.log('KKKKpropertyToPopulate', propertyToPopulate)
  //   return this.initialCall(() => this.populateValue({value: propertyToPopulate}, true))
  // }

  /**
   * Split the cleaned variable string containing one or more comma delimited variables and get a
   * final value for the entirety of the string
   * @param varible The variable string to split and get a final value for
   * @param property The original property string the given variable was extracted from
   * @returns {Promise} A promise resolving to the final value of the given variable
   */
  splitAndGet(variable, valueObject) {
    if (DEBUG) {
      console.log('>>>>>>>> Split and Get')
    }
    const parts = splitByComma(variable)

    if (parts.length > 1) {
      if (DEBUG) {
        console.log('parts variable:', variable)
        console.log('parts property:', valueObject.value)
        console.log('All parts:', parts)
        console.log('-----')
      }
      return this.overwrite(parts, valueObject)
    }
    return this.getValueFromSource(parts[0], valueObject)
  }
  /**
   * Populate a given property, given the matched string to replace and the value to replace the
   * matched string with.
   * @param valueObject.value The property to replace the matched string with the value.
   * @param matchedString The string in the given property that was matched and is to be replaced.
   * @param valueToPopulate The value to replace the given matched string in the property with.
   * @returns {Promise.<TResult>|*} A promise resolving to the property populated with the given
   *  value for all instances of the given matched string.
   */
  populateVariable(valueObject, matchedString, valueToPopulate) {
    // console.log('populateVariable: valueToPopulate', valueToPopulate)
    let property = valueObject.value
    // total replacement
    if (property === matchedString) {
      property = valueToPopulate
    // partial replacement, string
    } else if (_.isString(valueToPopulate)) {
      property = replaceall(matchedString, valueToPopulate, property)
    // partial replacement, number
    } else if (_.isNumber(valueToPopulate)) {
      property = replaceall(matchedString, String(valueToPopulate), property)
    } else {
      let missingValue = matchedString
      if (matchedString.match(deepRefSyntax)) {
        const deepIndex = matchedString.split(':')[1].replace('}', '')
        const i = Number(deepIndex)
        missingValue = this.deep[i]
      }
      const errorMessage = `
Missing Value ${missingValue}

Make sure the property is being passed in correctly
      `
      throw new Error(errorMessage)
    }
    return {
      value: property,
      path: valueObject.path,
      other: 'thing',
      __config: true
    }
  }
  // ###############
  // ## VARIABLES ##
  // ###############
  /**
   * Resolve the given variable string that expresses a series of fallback values in case the
   * initial values are not valid, resolving each variable and resolving to the first valid value.
   * @param variableStringsString The overwrite string of variables to populate and choose from.
   * @returns {Promise.<TResult>|*} A promise resolving to the first validly populating variable
   *  in the given variable strings string.
   */
  overwrite(variableStrings, valueObject) {
    const propertyString = valueObject.value
    const pathValue = valueObject.path
    // console.log('variableStrings', variableStrings)

    // console.log('propertyString', typeof propertyString)
    const variableValues = variableStrings.map((variableString) => {
      // This runs on nested variable resolution
      return this.getValueFromSource(variableString, valueObject)
    })

    // console.log('variableValues', variableValues)

    return Promise.all(variableValues).then(values => {
      let deepPropertyStr = propertyString
      let deepProperties = 0
      values.forEach((value, index) => {
        // console.log('valuevaluevaluevaluevaluevaluevaluevalue', value)
        if (_.isString(value) && value.match(this.variableSyntax)) {
          deepProperties += 1
          const deepVariable = this.makeDeepVariable(value)
          const newValue = cleanVariable(deepVariable, this.variableSyntax)
          // console.log('variableStrings', variableStrings)
          deepPropertyStr = deepPropertyStr.replace(variableStrings[index], newValue)
          // console.log('deepPropertyString', deepPropertyStr)
        }
      })
      return deepProperties > 0
        ? Promise.resolve(deepPropertyStr) // return deep variable replacement of original
        : Promise.resolve(values.find(isValidValue))// resolve first valid value, else undefined
    })
  }
  /**
   * Given any variable string, return the value it should be populated with.
   * @param variableString The variable string to retrieve a value for.
   * @returns {Promise.<TResult>|*} A promise resolving to the given variables value.
   */
  getValueFromSource(variableString, valueObject) {
    const propertyString = valueObject.value
    const pathValue = valueObject.path

    // return resolved value
    if (this.tracker.contains(variableString)) {
      return this.tracker.get(variableString, propertyString)
    }

    // Else lookup value from various sources
    if (DEBUG) {
      console.log('>>>>> getValueFromSource')
      console.log('variableString:', variableString)
      console.log('propertyString:', propertyString)
      console.log('pathValue:', pathValue)
      console.log('valueObject', valueObject)
      console.log('-----')
    }

    let resolverFunction
    // Loop over variables and set getterFunction when match found.
    const found = this.variableTypes.some((r, i) => {
      if (r.match instanceof RegExp && variableString.match(r.match)) {
        // set resolver function
        resolverFunction = r.resolver
        return true
      } else if (typeof r.match === 'function') {
        // TODO finalize match API
        if (r.match(variableString, this.config)) {
          // set resolver function
          resolverFunction = r.resolver
          return true
        }
      }
      return false
    })

    if (found && resolverFunction) {
      // TODO finalize resolverFunction API
      const valuePromise = resolverFunction(variableString, this.options, this.config)
      return this.tracker.add(variableString, valuePromise, propertyString)
    }

    // Variable not found
    const errorMessage = [
      `Invalid variable reference syntax for variable "${variableString}" ${propertyString}`
    ]

    // Default value used for self variable
    if (propertyString.match(/,/)) {
      errorMessage.push('\n Default values for self referenced values are not allowed')
      errorMessage.push(`\n Fix the ${propertyString} variable`)
    }

    const message = errorMessage.join('')
    const notFoundPromise = Promise.reject(new Error(message))

    return this.tracker.add(variableString, notFoundPromise, propertyString)
  }

  getValueFromSelf(variableString) {
    const split = variableString.split(':')
    const variable = (split.length && split[1]) ? split[1] : variableString
    const valueToPopulate = this.config
    const deepProperties = variable.split('.').filter(property => property)
    return this.getDeeperValue(deepProperties, valueToPopulate)
  }

  getValueFromFile(variableString) {
    const matchedFileString = variableString.match(fileRefSyntax)[0]
    const relativePath = matchedFileString
      .replace(fileRefSyntax, (match, varName) => varName.trim())
      .replace('~', os.homedir())

    let fullFilePath = (path.isAbsolute(relativePath) ? relativePath : path.join(this.configPath, relativePath))

    if (fs.existsSync(fullFilePath)) {
      // Get real path to handle potential symlinks (but don't fatal error)
      fullFilePath = fs.realpathSync(fullFilePath)

    // Only match files that are relative
    } else if (relativePath.match(/\.\//)) {
      // TODO test higher parent refs
      const cleanName = path.basename(relativePath)
      fullFilePath = findUp.sync(cleanName, { cwd: this.configPath })
    }

    let fileExtension = relativePath.split('.')

    fileExtension = fileExtension[fileExtension.length - 1]

    // Validate file exists
    if (!fs.existsSync(fullFilePath)) {
      // console.log('NO FILE FOUND', fullFilePath)
      // console.log('variableString', variableString)
      const errorMsg = `${logLines}
Variable ${variableString} cannot resolve due to missing file.

File not found ${fullFilePath}

Default fallback value will be used if provided.
${logLines}
`

      console.log(errorMsg)
      // TODO maybe reject. YAML does not allow for null/undefined values
      // return Promise.reject(new Error(errorMsg))
      return Promise.resolve(undefined)
    }

    let valueToPopulate

    // Process JS files
    if (fileExtension === 'js') {
      const jsFile = require(fullFilePath)
      let returnValueFunction = jsFile
      // TODO change how exported functions are referenced
      const variableArray = variableString.split(':')

      if (variableArray[1]) {
        let jsModule = variableArray[1]
        jsModule = jsModule.split('.')[0]
        returnValueFunction = jsFile[jsModule]
      }

      if (typeof returnValueFunction !== 'function') {
        const errorMessage = `Invalid variable syntax when referencing file "${relativePath}".
Check if your javascript is exporting a function that returns a value.`
        return Promise.reject(new Error(errorMessage))
      }
      // TODO update what is passed into function
      valueToPopulate = returnValueFunction.call(jsFile, this.config)

      return Promise.resolve(valueToPopulate).then((valueToPopulateResolved) => {
        let deepProperties = variableString.replace(matchedFileString, '')
        deepProperties = deepProperties.slice(1).split('.')
        deepProperties.splice(0, 1)
        return this.getDeeperValue(deepProperties, valueToPopulateResolved)
          .then((deepValueToPopulateResolved) => {
            if (typeof deepValueToPopulateResolved === 'undefined') {
              const errorMessage = `Invalid variable syntax when referencing file "${relativePath}".
Check if your javascript is returning the correct data.`
              return Promise.reject(new Error(errorMessage))
            }
            return Promise.resolve(deepValueToPopulateResolved)
          })
      })
    }

    // Process everything except JS
    if (fileExtension !== 'js') {
      /* Read initial file */
      valueToPopulate = fs.readFileSync(fullFilePath, 'utf-8')

      // File reference has :subKey lookup. Must dig deeper
      if (matchedFileString !== variableString) {
        if (fileExtension === 'yml' || fileExtension === 'yaml') {
          valueToPopulate = JSON.stringify(YAML.parse(valueToPopulate))
        }
        let deepProperties = variableString.replace(matchedFileString, '')
        if (deepProperties.substring(0, 1) !== ':') {
          const errorMessage = `Invalid variable syntax when referencing file "${relativePath}" sub properties
Please use ":" to reference sub properties`
          return Promise.reject(new Error(errorMessage))
        }
        deepProperties = deepProperties.slice(1).split('.')
        return this.getDeeperValue(deepProperties, valueToPopulate)
      }

      if (fileExtension === 'yml' || fileExtension === 'yaml') {
        valueToPopulate = YAML.parse(valueToPopulate)
        return Promise.resolve(valueToPopulate)
      }

      if (fileExtension === 'json') {
        valueToPopulate = JSON.parse(valueToPopulate)
        return Promise.resolve(valueToPopulate)
      }
    }
    return Promise.resolve(valueToPopulate)
  }

  getDeepIndex(variableString) {
    const deepIndexReplace = RegExp(/^deep:|(\.[^}]+)*$/g)
    return variableString.replace(deepIndexReplace, '')
  }
  getVariableFromDeep(variableString) {
    const index = this.getDeepIndex(variableString)
    return this.deep[index]
  }
  getValueFromDeep(variableString) {
    const deepPrefixReplace = RegExp(/(?:^deep:)\d+\.?/g)
    const variable = this.getVariableFromDeep(variableString)
    const deepRef = variableString.replace(deepPrefixReplace, '')
    let ret = this.populateValue({ value: variable })
    if (deepRef.length) { // if there is a deep reference remaining
      ret = ret.then((result) => {
        if (_.isString(result.value) && result.value.match(this.variableSyntax)) {
          const deepVariable = this.makeDeepVariable(result.value)
          return Promise.resolve(appendDeepVariable(deepVariable, deepRef))
        }
        return this.getDeeperValue(deepRef.split('.'), result.value)
      })
    }
    return ret
  }

  makeDeepVariable(variable) {
    let index = this.deep.findIndex((item) => variable === item)
    if (index < 0) {
      index = this.deep.push(variable) - 1
    }
    const variableContainer = variable.match(this.variableSyntax)[0]
    const variableString = cleanVariable(variableContainer, this.variableSyntax)
    const deepVar = variableContainer.replace(/\s/g, '').replace(variableString, `deep:${index}`)

    return deepVar
  }

  /**
   * Get a value that is within the given valueToPopulate.  The deepProperties specify what value
   * to retrieve from the given valueToPopulate.  The trouble is that anywhere along this chain a
   * variable can be discovered.  If this occurs, to avoid cyclic dependencies, the resolution of
   * the deep value from the given valueToPopulate must be halted.  The discovered variable is thus
   * set aside into a "deep variable" (see makeDeepVariable).  The indexing into the given
   * valueToPopulate is then resolved with a replacement ${deep:${index}.${remaining.properties}}
   * variable (e.g. ${deep:1.foo}).  This pauses the population for continuation during the next
   * generation of evaluation (see getValueFromDeep)
   * @param deepProperties The "path" of properties to follow in obtaining the deeper value
   * @param valueToPopulate The value from which to obtain the deeper value
   * @returns {Promise} A promise resolving to the deeper value or to a `deep` variable that
   * will later resolve to the deeper value
   */
  getDeeperValue(deepProperties, valueToPopulate) {
    // TODO refactor out of BbPromise.reduce
    return BbPromise.reduce(deepProperties, (reducedValueParam, subProperty) => {
      let reducedValue = reducedValueParam
      if (_.isString(reducedValue) && reducedValue.match(deepRefSyntax)) { // build mode
        reducedValue = appendDeepVariable(reducedValue, subProperty)
      } else { // get mode
        if (typeof reducedValue === 'undefined') {
          reducedValue = {}
        } else if (subProperty !== '' || '' in reducedValue) {
          try {
            // if JSON parse it
            reducedValue = JSON.parse(reducedValue)
          } catch (e) {}

          reducedValue = reducedValue[subProperty]
        }
        if (typeof reducedValue === 'string' && reducedValue.match(this.variableSyntax)) {
          reducedValue = this.makeDeepVariable(reducedValue)
        }
      }

      return Promise.resolve(reducedValue)
    }, valueToPopulate)
  }

  warnIfNotFound(variableString, valueToPopulate) {
    if (!isValidValue(valueToPopulate)) {
      let varType
      if (variableString.match(envRefSyntax)) {
        varType = 'environment variable'
      } else if (variableString.match(optRefSyntax)) {
        varType = 'option'
      } else if (variableString.match(selfRefSyntax)) {
        varType = 'service attribute'
      } else if (variableString.match(fileRefSyntax)) {
        varType = 'file'
      }
      console.log(`A valid ${varType} to satisfy the declaration '${variableString}' could not be found.`)
    }
    return valueToPopulate
  }
}

module.exports = Configorama
