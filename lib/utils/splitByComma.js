const { match } = require('../resolvers/valueFromString')
const overwriteSyntax = RegExp(/\s*(?:,\s*)+/g) // /\s*(?:,\s*)+/g
const stringRefSyntax = match
/**
 * Split a given string by whitespace padded commas excluding those within single or double quoted
 * strings.
 * @param string The string to split by comma.

 var string = "env:BAZ,'defaultEnvValue'"
 splitByComma(string)
 => ["env:BAZ", "'defaultEnvValue'"]
 */
module.exports = function splitByComma(string) {
  const input = string.trim()
  const stringMatches = []
  let match = stringRefSyntax.exec(input)
  while (match) {
    stringMatches.push({
      start: match.index,
      end: stringRefSyntax.lastIndex,
    })
    match = stringRefSyntax.exec(input)
  }
  const commaReplacements = []
  const contained = (commaMatch) => { // curry the current commaMatch
    return (stringMatch) => { // check whether stringMatch containing the commaMatch
      return stringMatch.start < commaMatch.index && overwriteSyntax.lastIndex < stringMatch.end
    }
  }
  match = overwriteSyntax.exec(input)
  while (match) {
    const matchContained = contained(match)
    const containedBy = stringMatches.find(matchContained)
    if (!containedBy) { // if uncontained, this comma respresents a splitting location
      commaReplacements.push({
        start: match.index,
        end: overwriteSyntax.lastIndex,
      })
    }
    match = overwriteSyntax.exec(input)
  }
  let prior = 0
  const results = []
  commaReplacements.forEach((replacement) => {
    results.push(input.slice(prior, replacement.start))
    prior = replacement.end
  })
  // const what = input.slice(prior)
  // // TODO finish digit string matching
  // const matchDigitString = /^['|"]\d+['|"]$/g
  // if (what.match(matchDigitString)) {
  //   console.log('Is digit string')
  // }
  // console.log('what', what)
  results.push(input.slice(prior))
  return results
}
