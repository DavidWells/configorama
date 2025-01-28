const os = require('os')
const path = require('path')
const fs = require('fs')
const promiseFinallyShim = require('promise.prototype.finally').shim()
// @TODO only import lodash we need
const isArray = require('lodash.isarray')
const isString = require('lodash.isstring')
const isNumber = require('lodash.isnumber')
const isObject = require('lodash.isobject')
const isDate = require('lodash.isdate')
const isRegExp = require('lodash.isregexp')
const isFunction = require('lodash.isfunction')
const isEmpty = require('lodash.isempty')
const trim = require('lodash.trim')
const camelCase = require('lodash.camelcase')
const kebabCase = require('lodash.kebabcase')
const capitalize = require('lodash.capitalize')
const split = require('lodash.split')
const map = require('lodash.map')
const mapValues = require('lodash.mapvalues')
const assign = require('lodash.assign')
const set = require('lodash.set')
const cloneDeep = require('lodash.clonedeep')
const findUp = require('find-up')
const replaceall = require('replaceall')
const traverse = require('traverse')
const dotProp = require('dot-prop')
/* Default Value resolvers */
const getValueFromString = require('./resolvers/valueFromString')
const getValueFromNumber = require('./resolvers/valueFromNumber')
const getValueFromEnv = require('./resolvers/valueFromEnv')
const getValueFromOptions = require('./resolvers/valueFromOptions')
const createGitResolver = require('./resolvers/valueFromGit')
/* Default File Parsers */
const YAML = require('./parsers/yaml')
const TOML = require('./parsers/toml')
/* functions */
const md5Function = require('./functions/md5')

/* Utility/helpers */
const splitByComma = require('./utils/splitByComma')
const cleanVariable = require('./utils/cleanVariable')
const appendDeepVariable = require('./utils/appendDeepVariable')
const isValidValue = require('./utils/isValidValue')
const PromiseTracker = require('./utils/PromiseTracker')
const handleSignalEvents = require('./utils/handleSignalEvents')
const formatFunctionArgs = require('./utils/formatFunctionArgs')
const cloudFormationSchema = require('./utils/cloudformationSchema')
const trimSurroundingQuotes = require('./utils/trimSurroundingQuotes')
const deepLog = require('./utils/deep-log')
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
const fileRefSyntax = RegExp(/^file\((~?[a-zA-Z0-9._\-\/,'" ]+?)\)/g)
// TODO update file regex ^file\((~?[a-zA-Z0-9._\-\/, ]+?)\)
// To match file(asyncValue.js, lol) input params
const envRefSyntax = RegExp(/^env:/g)
const optRefSyntax = RegExp(/^opt:/g)
const selfRefSyntax = RegExp(/^self:/g)
const funcRegex = /(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
const funcStartOfLineRegex = /^(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
const subFunctionRegex = /(\w+):(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
const base64WrapperRegex = /\[_\[([A-Za-z0-9+/=\s]*)\]_\]/g
const logLines = '─────────────────────────────────────────────────'
const DEBUG = false

const ENABLE_FUNCTIONS = true

class Configorama {
  constructor(fileOrObject, opts) {
    /* attach sig events on async calls */
    if (opts && !opts.sync) {
      handleSignalEvents()
    }
    const options = opts || {}
    // Set opts to pass into JS file calls
    this.opts = Object.assign({}, {
      // Allow for unknown variable syntax to pass through without throwing errors
      allowUnknownVars: false,
      // Allow undefined to be an end result.
      allowUndefinedValues: false,
    }, options)

    
    const defaultSyntax = '\\${((?!AWS|stageVariables)[ ~:a-zA-Z0-9=+!@#%*<>?._\'",|\\-\\/\\(\\)\\\\]+?)}'
    const variableSyntax = options.syntax || defaultSyntax
    let varRegex
    if (typeof variableSyntax === 'string') {
      varRegex = RegExp(variableSyntax, 'g')
      // this.variableSyntax = /\${((?!AWS)([ ~:a-zA-Z0-9=+!@#%*<>?._'",|\-\/\(\)\\]+?|(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*))}/
    } else if (variableSyntax instanceof RegExp) {
      varRegex = variableSyntax
    }
    // console.log('varRegex', varRegex)
    this.variableSyntax = varRegex

    // Set initial config object to populate
    if (typeof fileOrObject === 'object') {
      // set config objects
      this.config = fileOrObject
      // Keep a copy
      this.originalConfig = cloneDeep(fileOrObject)
      // Set configPath for file references
      this.configPath = options.configDir || process.cwd()
    } else if (typeof fileOrObject === 'string') {
      // read and parse file
      const fileContents = fs.readFileSync(fileOrObject, 'utf-8')
      const fileDirectory = path.dirname(path.resolve(fileOrObject))
      const fileType = path.extname(fileOrObject)

      let configObject
      if (fileType.match(/\.(yml|yaml)/)) {
        try {
          const ymlText = YAML.preProcess(fileContents, varRegex)
          // console.log('ymlText', ymlText)
          configObject = YAML.parse(ymlText)
        } catch (err) {
          // Attempt to fix cloudformation refs
          if (err.message.match(/YAMLException/)) {
            const ymlText = YAML.preProcess(fileContents, varRegex)
            const result = YAML.load(ymlText, {
              filename: fileOrObject,
              schema: cloudFormationSchema.schema
            })
            if (result.error) {
              throw result.error
            }
            configObject = result.data
          }
        }
      } else if (fileType.match(/\.(toml)/)) {
        configObject = TOML.parse(fileContents)
      } else if (fileType.match(/\.(json)/)) {
        configObject = JSON.parse(fileContents)
      } else if (fileType.match(/\.(js)/)) {
        let jsFile
        try {
          jsFile = require(fileOrObject)
          if (typeof jsFile !== 'function') {
            configObject = jsFile
          } else {
            let jsArgs = opts.dynamicArgs || {}
            if (jsArgs && typeof jsArgs === 'function') {
              jsArgs = jsArgs()
            }
            configObject = jsFile(jsArgs)
          }
        } catch (err) {
          throw new Error(err)
        }
      }
      // set config objects
      this.config = configObject
      // Keep a copy
      this.originalConfig = cloneDeep(configObject)
      // Set configPath for file references
      this.configPath = fileDirectory
    }

    // Track promise resolution
    this.tracker = new PromiseTracker()

    // Variable Sources
    this.variableTypes = [
      /**
       * Environment variables
       * Usage:
       * ${env:Key}
       * ${env:KeyTwo, "fallbackValue"}
       */
      getValueFromEnv,
      /**
       * CLI flags
       * Usage:
       * ${opt:stage}
       * ${opt:other, "fallbackValue"}
       */
      getValueFromOptions,
      /**
       * Self references
       * Usage:
       * ${otherKeyInConfig}
       * ${otherKeyInConfig, "fallbackValue"}
       * // or ${self:otherKeyInConfig}
       */
      {
        match: selfRefSyntax,
        resolver: (varString, o, x, pathValue) => {
          return this.getValueFromSelf(varString, o, x, pathValue)
        }
      },
      /**
       * File references
       * Usage:
       * ${file(pathToFile.json)}
       * ${file(pathToFile.yml), "fallbackValue"}
       */
      {
        match: fileRefSyntax,
        resolver: (varString, o, x, pathValue) => {
          // console.log('pathValue getValueFromFile', pathValue)
          return this.getValueFromFile(varString)
        }
      },

      // Git refs
      createGitResolver(this.configPath),
      /* Internal Resolvers */
      // {
      //   match: funcRegex,
      //   resolver: (varString) => {
      //     return this.getValueFromFunction(varString)
      //   }
      // },
      // getValueFromString,
      {
        match: RegExp(/(?:('|").*?\1)/g),
        resolver: (varString, o, x, pathValue) => {
          // console.log('pathValue getValueFromString', pathValue)
          return this.getValueFromString(varString)
        }
      },
      // Deep references
      {
        match: deepRefSyntax,
        resolver: (varString) => {
          return this.getValueFromDeep(varString)
        }
      },
      // Numbers
      getValueFromNumber,
    ]

    /* Nicer self: references. Match key in object */
    const fallThroughSelfMatcher = {
      match: (varString, fullObject, valueObject) => {
        // console.log('fallthrough varString', varString)
        // console.log('fallthrough valueObject', valueObject)
        // console.log('fullObject', fullObject)
        /* its file ref so we need to shift lookup for self in nested files */
        if (valueObject.isFileRef) {
          const exists = dotProp.get(fullObject, varString)
          // console.log('fallthrough exists', exists)
          if (!exists) {
            // @ Todo make recursive
            const deepProperties = [valueObject.path[0]].concat(varString)
            const dotPropPath = deepProperties.join('.')
            const deeperExists = dotProp.get(fullObject, dotPropPath)
            // console.log('fallthrough deeper', deeperExists)
            return deeperExists
          }
        }
        /* is simple ${whatever} reference in same file */
        const startOf = varString.split('.')
        return fullObject[startOf[0]]
      },
      resolver: (varString, o, x, pathValue) => {
        return this.getValueFromSelf(varString, o, x, pathValue)
      }
    }

    /* Apply user defined variable sources */
    if (options.variableSources) {
      this.variableTypes = this.variableTypes.concat(options.variableSources)
    }

    /* attach self matcher last */
    this.variableTypes = this.variableTypes.concat(fallThroughSelfMatcher)

    // Additional filters on values. ${thing | filterFunction}
    this.filters = {
      toUpperCase: (val) => {
        if (typeof val === 'string') {
          return val.toUpperCase()
        } else if (Array.isArray(val)) {
          return val.map((v) => {
            return v.toUpperCase()
          })
        }
      },
      toLowerCase: (val) => {
        if (typeof val === 'string') {
          return val.toLowerCase()
        } else if (Array.isArray(val)) {
          return val.map((v) => {
            return v.toLowerCase()
          })
        }
      },
      toCamelCase: (val) => {
        return camelCase(val)
      },
      toKebabCase: (val) => {
        return kebabCase(val)
      },
      capitalize: (val) => {
        return capitalize(val)
      }
    }

    // Apply user defined filters
    if (options.filters) {
      this.filters = Object.assign({}, this.filters, options.filters)
    }

    this.functions = {
      split: (value, delimiter, limit) => {
        const delimit = delimiter || ','
        const splitVal = split(value, delimit)
        return splitVal
      },
      join: (value, delimiter) => {
        if (isString(value)) {
          value = [value]
        }
        if (!isArray(value)) {
          throw new Error('value must be array for join() function')
        }
        const delimit = delimiter || ','
        return value.join(delimit)
      },
      /*
      Usage:
        ${length(var.hostnames)}
      */
      length: (value) => {
        // "${length(var.hostnames)}"
        if (typeof value === 'string' || Array.isArray(value)) {
          return value.length
        }
        if (typeof value === 'object') {
          return Object.keys(value).length
        }
      },
      merge: (value, otherValue) => {
        if (!value || !otherValue) {
          // throw new Error('missing value', value)
        }
        if (typeof value === 'string' && typeof otherValue === 'string') {
          return value + otherValue
        }
        if (isArray(value) && isArray(otherValue)) {
          return otherValue.concat(value)
        }
        return assign({}, value, otherValue)
      },
      math: () => {},
      upperKeys: (o) => {
        return Object.keys(o).reduce((c, k) => (c[k.toUpperCase()] = o[k], c), {}) // eslint-disable-line
      },
      md5: md5Function
    }

    // Apply user defined functions
    if (options.functions) {
      this.functions = Object.assign({}, this.functions, options.functions)
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

  /**
   * Populate all variables in the service, conviently remove and restore the service attributes
   * that confuse the population methods.
   * @param cliOpts An options hive to use for ${opt:...} variables.
   * @returns {Promise.<TResult>|*} A promise resolving to the populated service.
   */
  init(cliOpts) {
    this.options = cliOpts || {}
    const configoramaOpts = this.opts
    const originalConfig = this.originalConfig
    return this.initialCall(() => {
      return Promise.resolve().then(() => {
        return this.populateObjectImpl(this.config).finally(() => {
          // TODO populate function values here?
          // console.log('Final Config', this.config)
          const transform = this.runFunction.bind(this)
          const varSyntax = this.variableSyntax
          // Traverse resolved object and run functions
          // console.log('this.config', this.config)
          traverse(this.config).forEach(function (rawValue) {
            /* Pass through unknown variables */
            if (!configoramaOpts.allowUndefinedValues && typeof rawValue === 'undefined') {
              const configValuePath = this.path.join('.')
              const ogValue = dotProp.get(originalConfig, configValuePath)
              const varDisplay = (ogValue) ? `"${ogValue}" variable` : 'variable'
              const errorMessage = `
 Config error:
 "${configValuePath}" resolved to "undefined"
 Verify the ${varDisplay} in config at "${configValuePath}"`
              throw new Error(errorMessage)
            }
            if (typeof rawValue === 'string') {
              /* Process inline functions like merge() */
              if (ENABLE_FUNCTIONS && rawValue.match(/> function /)) {
                // console.log('RAW FUNCTION', rawFunction)
                const funcString = rawValue.replace(/> function /g, '')
                // console.log('funcString', funcString)
                const func = cleanVariable(funcString, varSyntax, true)
                const funcVal = transform(func)
                const hasObjectRef = rawValue.match(/\.\S*$/)
                if (hasObjectRef && typeof funcVal === 'object') {
                  const objectPath = hasObjectRef[0].replace(/^\./, '')
                  // console.log('objectPath', objectPath)
                  /* get value from object and update  */
                  const valueFromObject = dotProp.get(funcVal, objectPath)
                  // console.log('valueFromObject', valueFromObject)
                  this.update(valueFromObject)
                } else {
                  this.update(funcVal)
                }
              }
            
              
              /* Allow for unknown variables to pass through */
              if (rawValue.match(/>passthrough/)) {
                const newValues = decodeUnknown(rawValue)
                // console.log('>>>> newValues', newValues)
                this.update(newValues)
              }
            }
          })

          if (DEBUG) {
            console.log(`Variable process ran ${this.callCount} times`)
            // console.log('FINAL Value', this.config)
            // console.log(this.deep)
          }
        })
      }).then(() => {
        return this.config
      })
    })
  }
  runFunction(variableString) {
    /* If json object value return it */
    if (variableString.match(/^\s*{/) && variableString.match(/}\s*$/)) {
      return variableString
    }
    // console.log('runFunction', variableString)
    var hasFunc = funcRegex.exec(variableString)
    // TODO finish Function handling. Need to move this down below resolver to resolve inner refs first
    // console.log('hasFunc', hasFunc)
    if (!hasFunc) {
      return variableString
    }
    // test for object
    const functionName = hasFunc[1]
    const rawArgs = hasFunc[2]

    // TODO @DWELLS. Loop through all raw args and parse to correct datatype
    // argument is object
    let argsToPass
    if (rawArgs && rawArgs.match(/^{([^}]+)}$/)) {
      // console.log('OBJECT', hasFunc[2])
      argsToPass = [JSON.parse(rawArgs)]
    } else {
      // TODO fix how commas + spaces are ned
      const splitter = splitCsv(rawArgs, ', ')
      // console.log('splitterz', splitter)
      argsToPass = formatFunctionArgs(splitter)
    }
    // console.log('argsToPass runFunction', argsToPass)

    // TODO check for camelCase version. | toUpperCase messes with function name
    const theFunction = this.functions[functionName] || this.functions[functionName.toLowerCase()]

    if (!theFunction) {
      throw new Error(`Function "${functionName}" not found`)
    }

    const funcValue = theFunction(...argsToPass)
    // console.log('funcValuex', funcValue)
    // console.log('typeof funcValue', typeof funcValue)
    let replaceVal = funcValue
    if (typeof funcValue === 'string') {
      const replaceIt = variableString.replace(hasFunc[0], funcValue)
      replaceVal = cleanVariable(replaceIt, this.variableSyntax, true)
    }

    // If wrapped in outer function, recurse
    const hasMoreFunctions = funcRegex.exec(replaceVal)
    if (hasMoreFunctions) {
      return this.runFunction(replaceVal)
    }
    return replaceVal
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
    if (isArray(current)) {
      map(current, addContext)
    } else if (isObject(current) && !isDate(current) && !isRegExp(current) && !isFunction(current)) {
      if (atRoot || current !== root) {
        mapValues(current, addContext)
      }
    } else {
      // TODO Add values to leaves here
      const leaf = {
        path: context,
        value: current,
      }

      const thePath = (leaf.path.length > 1) ? leaf.path.join('.') : leaf.path[0]
      let originalValue = dotProp.get(this.originalConfig, thePath)
      // TODO @DWELLS make recursive
      if (!originalValue) {
        const parentArray = leaf.path.slice(0, -1)
        const parentPath = (parentArray > 1) ? parentArray.join('.') : parentArray[0]
        originalValue = dotProp.get(this.originalConfig, parentPath)
      }
      leaf.originalSource = originalValue
      if (originalValue && isString(originalValue)) {
        const varString = cleanVariable(originalValue, this.variableSyntax)
        if (varString.match(fileRefSyntax)) {
          leaf.isFileRef = true
        }
      }
      //  dotProp.get(this.originalConfig, thePath)
      results.push(leaf)
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
    // console.log('properties', properties)
    const variables = properties.filter((property) => {
      // Initial check if value has variable string in it
      return isString(property.value) && property.value.match(this.variableSyntax)
    })
    return map(variables, (valueObject) => {
      // console.log('valueObject', valueObject)
      return this.populateValue(valueObject, false)
        .then((populated) => {
          return assign({}, valueObject, { populated: populated.value })
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
          set(target, result.path, result.populated)
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
    
    if (DEBUG) {
      deepLog(`objectToPopulate ${this.callCount}`, objectToPopulate)
    }

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
    return map(matches, match => {
      // console.log('match', match)
      return ({
        match: match,
        variable: cleanVariable(match, this.variableSyntax),
      })
    })
  }
  /**
   * Populate the given matches, returning an array of Promises which will resolve to the populated
   * values of the given matches
   * @param {MatchResult[]} matches The matches to populate
   * @returns {Promise[]} Promises for the eventual populated values of the given matches
   */
  populateMatches(matches, valueObject, root) {
    // console.log('matches', matches)
    return map(matches, (match) => {
      return this.splitAndGet(match.variable, valueObject, root)
    })
  }
  /**
   * Render the given matches and their associated results to the given value
   * @param value The value into which to render the given results
   * @param matches The matches on the given value where the results are to be rendered
   * @param results The results that are to be rendered to the given value
   * @returns {*} The populated value with the given results rendered according to the given matches
   */
  renderMatches(valueObject, matches, results) {
    /*
    console.log('RENDER', matches)
    console.log('RESULTS', results)
    /** */
    let result = valueObject.value
    for (let i = 0; i < matches.length; i += 1) {
      this.warnIfNotFound(matches[i].variable, results[i])
      // console.log('REDNER MATCHES', results[i])
      let valueToPop = results[i]
      // TODO refactor this. __internal_only_flag needed to stop clash with sync/async file resolution
      if (results[i] && typeof results[i] === 'object' && results[i].__internal_only_flag) {
        valueToPop = results[i].value
      }
    
      result = this.populateVariable(valueObject, matches[i].match, valueToPop)
      /*
      console.log('> valueToPop', valueToPop)
      console.log('> valueObject', valueObject)
      console.log('populateVariable r', result)
      console.log(this.deep)
      /** */
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
    /*
    console.log('matchesmatches', matches)
    /** */
    if (!isArray(matches)) {
      return Promise.resolve(property)
    }
    const populations = this.populateMatches(matches, valueObject, root)
    return Promise.all(populations)
      .then(results => this.renderMatches(valueObject, matches, results))
      .then((result) => {
        /*
        console.log('renderMatches result', result)
        /** */

        if (root && isArray(matches)) {
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
  //   console.log('propertyToPopulate', propertyToPopulate)
  //   return this.initialCall(() => this.populateValue({value: propertyToPopulate}, true))
  // }

  /**
   * Split the cleaned variable string containing one or more comma delimited variables and get a
   * final value for the entirety of the string
   * @param varible The variable string to split and get a final value for
   * @param property The original property string the given variable was extracted from
   * @returns {Promise} A promise resolving to the final value of the given variable
   */
  splitAndGet(variable, valueObject, root) {
    if (DEBUG) {
      console.log('>>>>>>>> Split and Get', variable)
      console.log('valueObject', valueObject)
      console.log('root', root)
    }

    /* requires node 8.11+
    if (valueObject.value.match(/(?<!^)> function /)) {
      // valueObject.value = valueObject.value.replace(/(?<!^)> function /, '')
      // valueObject.value = valueObject.value.replace(/^> function /, '')
      // valueObject.value = `> function ${valueObject.value}`
    }
    */

    const parts = splitByComma(variable)

    if (parts.length > 1) {
      if (DEBUG) {
        console.log('parts', parts)
        console.log('parts variable:', variable)
        console.log('parts property:', valueObject.value)
        console.log('All parts:', parts)
        console.log('-----')
      }
      return this.overwrite(parts, valueObject)
    }

    return this.getValueFromSource(parts[0], valueObject, 'splitAndGet')
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
    let property = valueObject.value
    if (DEBUG) {
      console.log('────────START populateVariable──────────────')
      console.log('populateVariable: valueToPopulate', valueToPopulate)
      console.log('populateVariable: valueObject', valueObject)
      console.log('populateVariable: property', property)
      console.log('populateVariable: matchedString', matchedString)
    }

    // total replacement
    if (property === matchedString) {
      const v = valueObject.value || ''
      const originalSrc = valueObject.originalSource || ''
      property = valueToPopulate
      /* Handle ${self:custom.ref, ''} with deep values */
      if (v.match(deepRefSyntax) && originalSrc.match(this.variableSyntax) && !v.match(/deep\:(\d*)\..*}$/)) {
        // console.log('MAJAJAAJJAAJAJJAJA', this.deep)
        // console.log('originalSrc', originalSrc)
        // console.log('value', v)
        let deepIndex = Number(v.match(/deep\:(\d*)/)[1])
        let item = this.deep[deepIndex]
        
        if (item.match(deepRefSyntax)) {
          deepIndex = Number(item.match(/deep\:(\d*)/)[1])
          item = this.deep[deepIndex]
        }
        property = this.deep[deepIndex]
      }
    // partial replacement, string
    } else if (isString(valueToPopulate)) {
      // if (property.match(/^> function /g)) {
      //
      //   const innerFunc = /> function (\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
      //   const match = property.match(innerFunc)
      //   const rep = (match) ? match[0].replace(/> function /, '') : property
      //   console.log('REPLACE', property)
      //   console.log('xxxx', rep)
      //   console.log('valueToPopulate', valueToPopulate)
      // }
  

      let currentMatchedString = matchedString
      /* Address fall through values if found */
      if (valueToPopulate.match(/>passthrough/)) {
        const decoded = decodeUnknown(valueToPopulate)
        if (decoded === property) {
          currentMatchedString = valueObject.value
        }
      }

      /*
      console.log('>------')
      console.log('isString og matchedString', matchedString)
      console.log('isString replaceThis: matchedString', currentMatchedString)
      console.log('isString withThis: valueToPopulate', valueToPopulate)
      console.log('isString decode:', decodeUnknown(valueToPopulate))
      console.log('isString inThis: property', property)
      console.log('isString currentMatchedString', currentMatchedString)
      console.log('>------')
      /** */
   
      // (replaceThis, withThis, inThis)
      property = replaceall(currentMatchedString, valueToPopulate, property)
      // console.log('property', property)

      // if (property.match(/^> function /g)) {
      //   console.log('REPLACE after', property)
      // }
    
    // partial replacement, number
    } else if (isNumber(valueToPopulate)) {
      property = replaceall(matchedString, String(valueToPopulate), property)
    // TODO This was temp fix for array value mismatch from filters. This fixes filterInner: ${commas | split(${self:inner}, 2) }
    // } else if (isArray(valueToPopulate) && valueToPopulate.length === 1) {
    //  property = replaceall(matchedString, String(valueToPopulate[0]), property)
    } else if (isObject(valueToPopulate)) {
      // console.log('OBJECT MATCH', valueToPopulate)
      property = replaceall(matchedString, JSON.stringify(valueToPopulate), property)// .replace(/}$/, '').replace(/^\$\{/, '')
      // console.log('property', property)
      // TODO run functions here
      // console.log('othere new propetry', property)
    } else {
      let missingValue = matchedString

      if (matchedString.match(deepRefSyntax)) {
        const deepIndex = matchedString.split(':')[1].replace('}', '')
        const i = Number(deepIndex)
        missingValue = this.deep[i]
      }

      const cleanVar = cleanVariable(property, this.variableSyntax)
      const cleanVarNoFilters = cleanVar.split('|')[0]
      const splitVars = splitByComma(cleanVarNoFilters)
      const nestedVar = findNestedVariable(splitVars, valueObject.originalSource)

      if (nestedVar) {
        const fallbackStr = getFallbackString(splitVars, nestedVar)
        if (!this.opts.allowUnknownVars) {
          verifyVariable(nestedVar, valueObject, this.variableTypes, this.config)
        }

        return {
          value: fallbackStr,
          path: valueObject.path,
          originalSource: valueObject.originalSource,
          // set __internal_only_flag to note this is object we make not a resolved value
          __internal_only_flag: true,
          caller: 'nestedVar'
        }
      }

      const errorMessage = `
Missing Value ${missingValue} - ${matchedString}

Make sure the property is being passed in correctly

For variable:

${valueObject.path}: ${valueObject.originalSource}
`
      throw new Error(errorMessage)
    }

    if (property && typeof property === 'string') {
      // console.log('property', property)
      const prop = cleanVariable(property, this.variableSyntax)
      // console.log('prop', prop)
      if (property.match(/^> function /g) && prop) {
        // console.log('PRPOpropertyproperty', property)
        // console.log('Prop', prop)
      }
      const func = funcRegex.exec(property)
      // console.log('func', func)
      if (func && property.match(/^> function /g)) {
        /* IMPORTANT fix `finalProp` for nested function reference
          nestedOne: 'hi'
          nestedTwo: ${merge('haha', 'wowowow')}
          mergeNested: ${merge('lol', ${nestedTwo})}
        */
        const finalProp = (property.match(/(?<!^)> function /)) ? prop : property

        return {
          value: finalProp, // prop to fix nested ¯\_(ツ)_/¯
          path: valueObject.path,
          originalSource: valueObject.originalSource,
          // set __internal_only_flag to note this is object we make not a resolved value
          // __internal_only_flag: true
        }
      }
      // TODO fix this ref
      // ${file(../async.js, lol hi there, ${self:normalKey})}
      // ^ passes through and matches file ref

      /* check for git:remote('whatever'). Sub functions that clash
      let funcNameHasColon = false
      if (func) {
        const subFunction = subFunctionRegex.exec(property)
        console.log('subFunction', subFunction)
        if (subFunction) {
          funcNameHasColon = true
        }
      }
      */
      // Does not match file refs with nested vars + args
      if (!prop.match(/file\((~?[a-zA-Z0-9._\-\/,'"\{\}\.$: ]+?)\)/) && func) {
        // console.log('IS FUNCTION')
        /* if matches function signature like ${merge('foo', 'bar')}
          rewrite the variable to run the function after inputs resolved
        */
        const rep = property.replace(/^> function /g, '')
        property = `> function ${rep}`
      }
      // if (prop.match(/\s\|/)) {
      //   console.log('HAS FILTER')
      //   const rep = property.replace(/FILTERSTART\|/g, '')
      //   const newer = rep.replace('|', 'FILTERSTART|')
      //   property = newer
      // }
    }
    // console.log('XXXX property', property)
    // console.log('XXXX path', valueObject.path)
    // console.log('XXXX originalSource', valueObject.originalSource)
    return {
      value: property,
      path: valueObject.path,
      originalSource: valueObject.originalSource,
      // set __internal_only_flag to note this is object we make not a resolved value
      __internal_only_flag: true,
      caller: 'end',
      count: this.callCount
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
    // console.log('variableStrings', variableStrings)

    // console.log('propertyString', typeof propertyString)
    const variableValues = variableStrings.map((variableString) => {
      // This runs on nested variable resolution
      return this.getValueFromSource(variableString, valueObject, 'overwrite')
    })

    // console.log('variableValues', variableValues)

    return Promise.all(variableValues).then(values => {
      let deepPropertyStr = propertyString
      let deepProperties = 0
      values.forEach((value, index) => {
        // console.log('valuevaluevaluevaluevaluevaluevaluevalue', value)
        if (isString(value) && value.match(this.variableSyntax)) {
          deepProperties += 1
          // console.log('makeDeepVariable overwrite', value)
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
  getValueFromSource(variableString, valueObject, caller) {
    const propertyString = valueObject.value
    const pathValue = valueObject.path
    // return resolved value
    if (this.tracker.contains(variableString)) {
      // console.log('try to get', variableString)
      return this.tracker.get(variableString, propertyString)
    }

    let newHasFilter
    // Else lookup value from various sources
    if (DEBUG) {
      console.log(`>>>>> getValueFromSource() call - ${caller}`)
      console.log('variableString:', variableString)
      console.log('propertyString:', propertyString)
      console.log('pathValue:', pathValue)
      console.log('valueObject', valueObject)
      console.log('-----')
    }

    const filters = propertyString.match(/\s\|/)
    // TODO match () or pipes |
    if (filters) {
      // console.log('variableString', variableString)

      // TODO clean this up
      const t = variableString.split('|')

      const string = cleanVariable(propertyString, this.variableSyntax, true)
      const filterz = string.split('|').filter((value, index, arr) => {
        return index > 0
      }).map((f) => {
        return trim(f)
      })
      // console.log('filters to run', filterz)

      newHasFilter = filterz
      // If current variable string has no pipes, it has no filters
      if (!variableString.match(/\|/)) {
        newHasFilter = null
      }
      // console.log('HAS FILTERS', filters)
      // console.log('t', t)
      variableString = trim(t[0])
    }

    let resolverFunction
    /* Loop over variables and set getterFunction when match found. */
    const found = this.variableTypes.some((r, i) => {
      if (r.match instanceof RegExp && variableString.match(r.match)) {
        // set resolver function
        resolverFunction = r.resolver
        return true
      } else if (typeof r.match === 'function') {
        // TODO finalize match API
        if (r.match(variableString, this.config, valueObject)) {
          // set resolver function
          resolverFunction = r.resolver
          return true
        }
      }
      return false
    })

    // console.log('found', found)

    if (found && resolverFunction) {
      // TODO finalize resolverFunction API
      const valuePromise = resolverFunction(
        variableString,
        this.options,
        this.config,
        valueObject
      ).then((val) => {
        // console.log('VALUE', val)
        if (val === null || typeof val === 'undefined' ||
          /* match deep refs as empty {}, they need resolving via functions */
          (typeof val === 'object' && isEmpty(val) && variableString.match(/deep\:/))
        ) {
          // console.log('variableString', variableString)
          const cleanV = cleanVariable(propertyString, this.variableSyntax)
          const valueCount = splitByComma(cleanV)

          if (variableString.match(/deep\:/)) {
            // return Promise.resolve(this.getValueFromDeep(variableString))
            const deepIndex = variableString.match(/deep\:(\d*)/)
            const deepPrefixReplace = RegExp(/(?:^deep:)\d+\.?/g)
            const deepRef = variableString.replace(deepPrefixReplace, '')
            // console.log('deepRef', deepRef)
            // console.log('deepIndexMatch', deepIndex)
            if (deepIndex[1] && this.deep.length) {
              const deepIndexValue = this.deep[parseInt(deepIndex[1])]
              // console.log('deepIndexValue', deepIndexValue)
              // console.log('FINAL', `${deepIndexValue}.${deepRef}`)
              if (deepIndexValue) {
                return Promise.resolve(`${deepIndexValue}.${deepRef}`)
              }
            }
          }
          // TODO throw on empty values?
          // No fallback value found AND this is undefined, throw error
          if (valueCount.length === 1) {
            throw new Error(`Error: Variable not found.
Variable: "${variableString}" from ${propertyString}
Value Path: ${(valueObject.path) ? valueObject.path.join('.') : 'na'}
Original Value: ${valueObject.originalSource}
Please fix this reference or provide a valid fallback value.
Like so: \${${variableString}, "fallbackValue"\}.`)
          }

          // no value resolved but fallback value exists, keep moving on
          return Promise.resolve(val)
        }
        // console.log('------')
        // console.log('propertyString', propertyString)
        // console.log('resolved val', val)
        // console.log('------')
        // console.log('newHasFilter', newHasFilter)
        // No filters found. return value
        if (!newHasFilter) {
          return Promise.resolve(val)
        }

        const newUse = newHasFilter.reduce((acc, currentFilter, i) => {
          if (!this.filters[currentFilter]) {
            throw new Error(`Filter "${currentFilter}" not found`)
          }
          return acc.concat({
            filter: this.filters[currentFilter],
            // args: argsToPass
          })
        }, [])

        if (typeof val === 'string' && val.match(/deep:/)) {
          // TODO refactor the deep filter logic here. match | filter | filter..
          const allFilters = propertyString.replace(/}$/, '').split('|').reduce((acc, currentFilter, i) => {
            if (i === 0) {
              return acc
            }
            acc += `| ${trim(currentFilter)}`
            return acc
          }, '')

          // add filters to deep references if filter is used
          const deepValueWithFilters = (newHasFilter[1]) ? val.replace(/}$/, ` ${allFilters}}`) : val
          // console.log('deepValueWithFilters', deepValueWithFilters)
          return Promise.resolve(deepValueWithFilters)
        }

        // console.log('newUse', newUse)
        /* Loop over filters used and produce new value */
        const newValue = newUse.reduce((a, c) => {
          // Fix for async value resolution. That code file refs returns object with .value
          const theValue = (typeof a === 'object' && a.__internal_only_flag) ? a.value : a

          if (typeof c.filter === 'function') {
            if (c.args) {
              return c.filter(theValue, ...c.args)
            }
            return c.filter(theValue)
          }
          return theValue
        }, val)

        return Promise.resolve(newValue)
      })

      // TODO do something with func here?

      return this.tracker.add(variableString, valuePromise, propertyString, newHasFilter)
    }

    /* fall through case with self refs */
    if (variableString) {
      // console.log('before clean propertyString', propertyString, variableString)
      const clean = cleanVariable(propertyString, this.variableSyntax)
      // TODO @DWELLS cleanVariable makes fallback values with spaces have no spaces
      // console.log('cleanVariable', clean)
      const cleanClean = clean.split('|')[0]
      // console.log('cleanCleanVariable', cleanClean)
      if (funcRegex.exec(cleanClean)) {
        const valuePromise = Promise.resolve(cleanClean)
        return this.tracker.add(cleanClean, valuePromise, propertyString, newHasFilter)
      }

      const split = splitByComma(cleanClean)

      // @TODO refactor this. USE FILTER [ 'commas', 'split("-"' ] is wrong
      let fallbackValue
      if (split.length === 2 || split.length === 3) {
        fallbackValue = split[1]
      } else if (clean.match(/\|/)) {
        fallbackValue = split[0]
      }

      const nestedVar = findNestedVariable(split, valueObject.originalSource)

      if (nestedVar) {
        if (!this.opts.allowUnknownVars) {
          verifyVariable(nestedVar, valueObject, this.variableTypes, this.config)
        }
        const fallbackStr = getFallbackString(split, nestedVar)
        return this.getValueFromSource(variableString, {
          value: fallbackStr
        }, 'nestedVar')
      }

      // TODO verify we need this still with file(file.js, param)
      // remove trailing ) for file fallback
      if (cleanClean.match(fileRefSyntax)) {
        // console.log('REPLACE', fallbackValue)
        fallbackValue = fallbackValue.replace(/\)$/, '')
        if (fallbackValue) {
          // recurse on fallback and check again
          return this.getValueFromSource(`${variableString})`, {
            value: propertyString
          }, 'cleanClean.match(fileRefSyntax)')
        }
      }
      // const fallbackValue = split[1]
      // console.log('variableString', variableString)
      // console.log('propertyString', propertyString)
      // console.log('fallbackValue', fallbackValue)

      if (variableString === fallbackValue) {
        const valuePromise = Promise.resolve(fallbackValue)
        return this.tracker.add(fallbackValue, valuePromise, propertyString, newHasFilter)
      }

      // has fallback but needs deeper lookup. Call getValueFromSource again
      if (fallbackValue) {
        if (DEBUG) {
          console.log('fallbackValue', fallbackValue)
        }
        // recurse on fallback and check again
        return this.getValueFromSource(fallbackValue, {
          value: propertyString
        }, 'fallbackValue')
      }
    }

    // Variable NOT FOUND. Warn user
    const errorMessage = [
      `Invalid variable reference syntax`,
      `Key: "${(valueObject.path) ? valueObject.path.join('.') : 'na'}"`,
      `Variable: "${variableString}" from ${propertyString} not found`,
    ]

    // Default value used for self variable
    if (propertyString.match(/,/)) {
      errorMessage.push('\n Default values for self referenced values are not allowed')
      errorMessage.push(`\n Fix the ${propertyString} variable`)
    }

    /* Pass through unknown variables */
    if (this.opts.allowUnknownVars) {
      // console.log('allowUnknownVars propertyString', propertyString)
      const varMatches = propertyString.match(this.variableSyntax)
      let allowUnknownVars = propertyString
      /* If variables found, encode them for passthrough */
      if (varMatches && varMatches.length) {
        varMatches.forEach((m) => {
          allowUnknownVars = allowUnknownVars.replace(m, encodeUnknown(m))
        })
      }
      // console.log('allowUnknownVars propertyString:', propertyString)
      // console.log('allowUnknownVars:', allowUnknownVars)
      return Promise.resolve(allowUnknownVars)
    }

    const message = errorMessage.join('\n')
    const notFoundPromise = Promise.reject(new Error(message))

    return this.tracker.add(variableString, notFoundPromise, propertyString, newHasFilter)
  }
  getValueFromString(variableString) {
    const valueToPopulate = variableString.replace(/^['"]|['"]$/g, '')
    return Promise.resolve(valueToPopulate)
  }

  getValueFromSelf(variableString, o, x, data) {
    /*
    console.log('getValueFromSelf variableString', variableString)
    /** */

    // console.log('self data', data)

    const split = variableString.split(':')
    const variable = (split.length && split[1]) ? split[1] : variableString
    const valueToPopulate = this.config
    let deepProperties = variable.split('.').filter(property => property)
    // console.log('self deep', deepProperties)
    // console.log('self valueToPopulate', valueToPopulate)

    /* its file ref so we need to shift lookup for self in nested files */
    if (data.isFileRef) {
      const dotPropPath = (deepProperties.length > 1) ? deepProperties.join('.') : deepProperties[0]
      const exists = dotProp.get(valueToPopulate, dotPropPath)
      // console.log('self exists', exists)
      if (!exists) {
        // @ Todo make recursive
        deepProperties = [data.path[0]].concat(deepProperties)
        // console.log('self fixed deepProperties', deepProperties)
      }
    }

    return this.getDeeperValue(deepProperties, valueToPopulate).then((res) => {
      /*
      console.log('self getDeeperValue variableString', variableString)
      console.log('self getDeeperValue result', res)
      /** */
      return res
    })
  }

  getValueFromFile(variableString) {
    // console.log('From file', `"${variableString}"`)
    let matchedFileString = variableString.match(fileRefSyntax)[0]
    // console.log('matchedFileString', matchedFileString)

    // Get function input params if any supplied
    var funcParamsRegex = /(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/g
    var hasParams = funcParamsRegex.exec(matchedFileString)
    // console.log('args', hasParams)
    let argsToPass = []
    if (hasParams) {
      const splitter = splitCsv(hasParams[2])
      const argsFound = splitter.map((arg) => {
        const cleanArg = trim(arg).replace(/^'|"/, '').replace(/'|"$/, '')
        return cleanArg
      })

      // If function has more arguments than file path
      if (argsFound.length && argsFound.length > 1) {
        matchedFileString = argsFound[0]
        argsToPass = argsFound.filter((arg, i) => {
          return i !== 0
        })
      }
    }
    // console.log('argsToPass', argsToPass)

    const relativePath = trimSurroundingQuotes(matchedFileString
      .replace(fileRefSyntax, (match, varName) => varName.trim())
      .replace('~', os.homedir()))
      

    let fullFilePath = (path.isAbsolute(relativePath) ? relativePath : path.join(this.configPath, relativePath))

    // console.log('fullFilePath', fullFilePath)

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

      const valueForFunction = {
        originalConfig: this.originalConfig,
        config: this.config,
        opts: this.opts,
      }

      valueToPopulate = returnValueFunction.call(jsFile, valueForFunction, ...argsToPass)

      return Promise.resolve(valueToPopulate).then((valueToPopulateResolved) => {
        let deepProperties = variableString.replace(matchedFileString, '')
        deepProperties = deepProperties.slice(1).split('.')
        deepProperties.splice(0, 1)
        // Trim prop keys for starting/trailing spaces
        deepProperties = deepProperties.map((prop) => {
          return trim(prop)
        })
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
        if (fileExtension === 'toml') {
          valueToPopulate = JSON.stringify(TOML.parse(valueToPopulate))
        }
        // console.log('deep', variableString)
        // console.log('matchedFileString', matchedFileString)
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

      if (fileExtension === 'toml') {
        valueToPopulate = TOML.parse(valueToPopulate)
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
    /*
    console.log('FIND INDEX', index)
    console.log(this.deep)
    /** */
    return this.deep[index]
  }
  getValueFromDeep(variableString) {
    const deepPrefixReplace = RegExp(/(?:^deep:)\d+\.?/g)
    const variable = this.getVariableFromDeep(variableString)
    const deepRef = variableString.replace(deepPrefixReplace, '')
    /*
    console.log("GET getValueFromDeep", variableString)
    console.log('deepRef', deepRef)
    console.log('variablex', variable)
    /** */
    let ret = this.populateValue({ value: variable })
    // console.log('variable ret', ret)
    if (deepRef.length) { // if there is a deep reference remaining
      ret = ret.then((result) => {
        // console.log('DEEP RESULT', result)
        if (isString(result.value) && result.value.match(this.variableSyntax)) {
          // console.log('makeDeepVariable getValueFromDeep', result.value)
          const deepVariable = this.makeDeepVariable(result.value)
          return Promise.resolve(appendDeepVariable(deepVariable, deepRef))
        }
        return this.getDeeperValue(deepRef.split('.'), result.value)
      })
    }
    return ret
  }

  makeDeepVariable(variable) {
    // console.log('MAKE DEEP', variable)
    let index = this.deep.findIndex((item) => variable === item)
    if (index < 0) {
      // console.log('this.deep.push', variable)
      index = this.deep.push(variable) - 1
    }
    // console.log("makeDeepVariable SET INDEX", index)
    const variableContainer = variable.match(this.variableSyntax)[0]
    const variableString = cleanVariable(variableContainer, this.variableSyntax)
    const deepVar = variableContainer.replace(variableString, `deep:${index}`)
    // TODO debugging space removal. Seems like this helps
    // const deepVar = variableContainer.replace(/\s/g, '').replace(variableString, `deep:${index}`)

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
    /*
    console.log('deepProperties', deepProperties)
    console.log('valueToPopulate', valueToPopulate)
    /** */

    const veryDeep = deepProperties.reduce(async (reducedValueParam, subProperty) => {
      let reducedValue = await reducedValueParam
      // console.log('reducedValue', reducedValue)
      // console.log(typeof reducedValue)
      // console.log('subProperty', `"${subProperty}"`)

      if (isString(reducedValue) && reducedValue.match(deepRefSyntax)) { // build mode
        reducedValue = appendDeepVariable(reducedValue, subProperty)
      } else { // get mode
        if (typeof reducedValue === 'undefined') {
          // was reducedValue = {}
          // Adding internal flag signals this value is unknown
          reducedValue = {
            value: undefined,
            path: undefined,
            originalSource: undefined,
            // set __internal_only_flag to note this is object we make not a resolved value
            __internal_only_flag: true,
            caller: 'getDeeperValue',
          }
        } else if (subProperty !== '' || (typeof reducedValue === 'object' && '' in reducedValue)) {
          try {
            // if JSON parse it
            reducedValue = JSON.parse(reducedValue)
          } catch (e) {}

          reducedValue = reducedValue[subProperty]
        } else if (isString(reducedValue)) {
          try {
            // if JSON parse it
            reducedValue = JSON.parse(reducedValue)
          } catch (e) {}

          reducedValue = reducedValue[subProperty]
        }
        if (typeof reducedValue === 'string' && reducedValue.match(this.variableSyntax)) {
          // console.log('makeDeepVariable reducedValue', reducedValue)
          reducedValue = this.makeDeepVariable(reducedValue)
        }
      }
      // console.log('fin', reducedValue)
      return Promise.resolve(reducedValue)
    }, Promise.resolve(valueToPopulate))

    return veryDeep
  }

  warnIfNotFound(variableString, valueToPopulate) {
    let varType
    if (variableString.match(envRefSyntax)) {
      varType = 'environment variable'
    } else if (variableString.match(optRefSyntax)) {
      varType = 'option'
    } else if (variableString.match(selfRefSyntax)) {
      varType = 'config attribute'
    } else if (variableString.match(fileRefSyntax)) {
      varType = 'file'
    } else if (variableString.match(deepRefSyntax)) {
      varType = 'deep'
    }
    if (!isValidValue(valueToPopulate)) {
      // console.log("MISSING", variableString)
      // console.log(this.deep)
      // console.log(valueToPopulate)

      const notFoundMsg = `No ${varType} found to satisfy the '\${${variableString}}' variable. Attempting fallback value`
      if (DEBUG) {
        console.log(notFoundMsg)
      }

      // errors make fallbacks not function. throw new Error(errorMsg)
    }
    return valueToPopulate
  }
}

function findNestedVariable(split, originalSource) {
  return split.find((thing) => {
    if (originalSource && typeof originalSource === 'string') {
      return originalSource.indexOf(`\${${thing}}`) > -1
    }
    return false
  })
}

/**
 * Get fallback variable string
 * @param  {array} split  - array from split at comma
 * @param  {string} nestedVar - fallback variable to reconstruct variable string from
 * @return {string} - returns new ${variable, string}
 */
function getFallbackString(split, nestedVar) {
  let isSet = false
  const newVar = split.reduce((acc, curr) => {
    if (curr === nestedVar || isSet) {
      acc = acc.concat(curr)
      isSet = true
    }
    return acc
  }, []).join(', ')
  const cleanC = `\${${newVar.replace(/^\${/, '').replace(/}$/, '')}}`
  return cleanC
}

function verifyVariable(variableString, valueObject, variableTypes, config) {
  const isRealVariable = variableTypes.some((r, i) => {
    if (r.match instanceof RegExp && variableString.match(r.match)) {
      return true
    } else if (typeof r.match === 'function') {
      if (r.match(variableString, config, valueObject)) {
        return true
      }
    }
    return false
  })
  // If not found in variable resolvers and is missing a colon throw
  if (!isRealVariable && variableString.match(/:/)) {
    // console.log('variableString', variableString)
    throw new Error(`
Variable \${${variableString}} is invalid variable syntax.
Value Path: ${(valueObject.path) ? valueObject.path.join('.') : 'na'}
Original Value: ${valueObject.originalSource}

Remove or update the \${${variableString}} to fix
`)
  }
  return isRealVariable
}

function encodeUnknown(v) {
  return `>passthrough[_[${Buffer.from(v).toString('base64')}]_]`
}

function decodeUnknown(rawValue) {
  const x = findUnknownValues(rawValue)
  let val = rawValue.replace(/>passthrough/g, '')
  if (x.length) {
    x.forEach(({ match, value }) => {
      // console.log('match', match)
      const decodedValue = Buffer.from(value, 'base64').toString('ascii')
      // console.log('decodedValue', decodedValue)
      val = val.replace(match, decodedValue)
    })
  }
  return val
}

function findUnknownValues(text) {
  let matches
  let links = []
  while ((matches = base64WrapperRegex.exec(text)) !== null) {
    if (matches.index === base64WrapperRegex.lastIndex) {
      base64WrapperRegex.lastIndex++ // avoid infinite loops with zero-width matches
    }
    links.push({
      match: matches[0], 
      value: matches[1] 
    })
  }
  return links
}

function isPromise(obj) { // eslint-disable-line
  return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function'
}

// TODO fix argument parsing to handle commas
function splitCsv(str, splitter) {
  const splitSyntax = splitter || ','
  // Split at comma SPACE ", "
  return str.split(splitSyntax).reduce((accum, curr) => {
    if (accum.isConcatting) {
      accum.soFar[accum.soFar.length - 1] += ',' + curr
    } else {
      accum.soFar.push(curr)
    }
    if (curr.split('"').length % 2 == 0) { // eslint-disable-line
      accum.isConcatting = !accum.isConcatting
    }
    return accum
  }, {
    soFar: [],
    isConcatting: false
  }).soFar
}

module.exports = Configorama
