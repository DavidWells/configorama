const YAML = require('js-yaml')
const TOML = require('./toml')
const JSON = require('./json5')

// Loader for custom CF syntax
function load(contents, options) {
  let data
  let error
  try {
    data = YAML.load(contents.toString(), options || {})
  } catch (exception) {
    error = exception
  }
  return { data, error }
}

const { createSafeWrapper, createFormatConverter } = require('../utils/safeParser')

function parseYaml(ymlContents) {
  return YAML.safeLoad(ymlContents)
}

function dumpYaml(object) {
  return YAML.safeDump(object, {
    noRefs: true
  })
}

const parse = createSafeWrapper(parseYaml)
const dump = createSafeWrapper(dumpYaml)
const toToml = createFormatConverter(parse, TOML.dump)
const toJson = createFormatConverter(parse, JSON.dump)

const { findOutermostVariables, findOutermostBracesDepthFirst } = require('../utils/bracketMatcher')

// Alias for backward compatibility
const matchOutermostBraces = findOutermostBracesDepthFirst


// https://regex101.com/r/XIltbc/1
const KEY_OBJECT = /^[ \t]*[^":\s]*:\s+\{/gm

const INNER_ARRAY = /\[(?:[^\[\]])*\]/g

function preProcess(ymlStr = '') {
  /*
  return ymlStr
  /** */

  // Fix nested variables in array brackets
  // in  -> y: !Not [!Equals [!Join ['', ${param:xyz}]]]
  // out -> y: !Not [!Equals [!Join ['', "${param:xyz}"]]]
  const arrayBracketMatches = ymlStr && ymlStr.match(
    // /\[(?:[^\[\]]+|)*\]/gm
    INNER_ARRAY
  )
  if (arrayBracketMatches) {
    // console.log('arrayBracketMatches', arrayBracketMatches)
    arrayBracketMatches.forEach((txt) => {
      // console.log('txt', txt)
      const hasNestedVars = txt && findOutermostVariables(txt)
      /*
      console.log(varRegex)
      console.log('findOutermostVariables(txt)', findOutermostVariables(txt))
      console.log('hasNested', hasNested)
      /** */
      if (hasNestedVars && hasNestedVars.length) {
        let fixedText = txt
        hasNestedVars.forEach((nested) => {
          // console.log('nested', nested)
          if (txt.indexOf(`"${nested}"`) > -1) {
            return
          }
          if (txt.indexOf(`'${nested}'`) > -1) {
            return
          }
          /* Replace variable wrapped in quotes */
          fixedText = fixedText.replace(nested, `"${nested}"`)
        })
        ymlStr = ymlStr.replace(txt, fixedText)
      }
    })
  }

  /* If have yaml object and vars not wrapped in quotes, wrap them */
  if (ymlStr.match(KEY_OBJECT)) {
    const values = matchOutermostBraces(ymlStr)
    // console.log('values', values)
    const hasObjects = values.filter((x) => !x.match(/{{resolve:/))
    // console.log('hasObjects', hasObjects)
    if (hasObjects && hasObjects.length) {
      hasObjects.forEach((txt) => {
        // console.log('obj text', txt)
        const hasNestedVars = txt && findOutermostVariables(txt)
        if (hasNestedVars && hasNestedVars.length) {
          let fixedText = txt
          hasNestedVars.forEach((nested) => {
            const isObject = txt.match(/^\{/) && txt.match(/}$/)
            // console.log('nested', nested)

            if (nested.match(/^\${/) && (nested.match(/"/) || nested.match(/'/)) && !isObject) {
              return
            }

            // Fallback comma ${opt:stage, dev}
            if (nested.match(/^\${/) && nested.match(/,/) && !txt.match(/\n/) ) {
              return
            }

            if (txt.indexOf(`"${nested}"`) > -1) {
              return
            }
            if (txt.indexOf(`'${nested}'`) > -1) {
              return
            }
            /* Replace variable wrapped in quotes */
            fixedText = fixedText.replace(nested, `"${nested}"`)
          })
          ymlStr = ymlStr.replace(txt, fixedText)
        }
      })
    }
    // Automagically wrap CF https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-ssm.html 
    const cfParams = values.filter((x) => !x.match(/\s/) && x.match(/{{resolve:/))
    if (cfParams && cfParams.length) {
      cfParams.forEach((txt) => {
        const pat = new RegExp(`([^'"])${txt}([^'"])`, 'g')
        const fixedText = `$1"${txt}"$2`
        ymlStr = ymlStr.replace(pat, fixedText)
      })
    }
  }
  // console.log('ymlStr', ymlStr)
  return ymlStr
}

module.exports = {
  preProcess: preProcess,
  parse: parse,
  load: load,
  dump: dump,
  toToml: toToml,
  toJson: toJson
}
