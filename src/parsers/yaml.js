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

function parse(ymlContents) {
  // Get document, or throw exception on error
  let ymlObject = {}
  try {
    ymlObject = YAML.safeLoad(ymlContents)
  } catch (e) {
    throw new Error(e)
  }
  return ymlObject
}

function dump(object) {
  let yml
  try {
    yml = YAML.safeDump(object, {
      noRefs: true
    })
  } catch (e) {
    throw new Error(e)
  }
  return yml
}

function toToml(ymlContents) {
  let toml
  try {
    toml = TOML.dump(parse(ymlContents))
  } catch (e) {
    throw new Error(e)
  }
  return toml
}

function toJson(ymlContents) {
  let json
  try {
    json = JSON.dump(parse(ymlContents))
  } catch (e) {
    throw new Error(e)
  }
  return json
}

// TODO only works for default var syntax ${}. Maybe fix?
function findOutermostVariables(text) {
  let matches = [];
  let depth = 0;
  let startIndex = -1;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && text[i + 1] === '{') {
      if (depth === 0) {
          startIndex = i;
      }
      depth++;
      i++; // Skip '{'
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && startIndex !== -1) {
        matches.push(text.substring(startIndex, i + 1));
        startIndex = -1;
      }
    }
  }
  return matches;
}


function matchOutermostBraces(text) {
  let depth = 0
  let startIndex = -1
  let results = []

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) {
        startIndex = i
      }
      depth++
    } else if (text[i] === '}') {
      depth--
      if (depth === 0 && startIndex !== -1) {
        results.push(text.substring(startIndex, i + 1))
        startIndex = -1
      }
    }
  }

  return results
}


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
