// Resolves the ${cron(...)} variable type: cleans the reference, then delegates human-readable/raw cron
// conversion to the standalone @davidwells/human-cron package.
const { trimSurroundingQuotes } = require('../utils/strings/quoteUtils')
const { parseCron } = require('@davidwells/human-cron')
const cronRefSyntax = RegExp(/^cron\((~?[\{\}\:\$a-zA-Z0-9._\-\/,'"\*\`?# ]+?)?\)/g)

function getValueFromCron(variableString) {
  // Get value from cron(expression)
  const cronExpression = variableString.match(/cron\((.*)\)/)[1]

  if (!cronExpression || cronExpression.trim() === '') {
    throw new Error(`Invalid variable syntax for cron reference "${variableString}".

\${cron} variable must have a pattern.

Examples:
  \${cron("every minute")}
  \${cron("weekdays")}
  \${cron("at 9:30")}
  \${cron("every 5 minutes")}
`)
  }

  // Remove surrounding quotes if present
  const cleanExpression = trimSurroundingQuotes(cronExpression, true)

  try {
    return Promise.resolve(parseCron(cleanExpression))
  } catch (error) {
    throw new Error(`Failed to parse cron expression "${cleanExpression}": ${error.message}`)
  }
}

module.exports = {
  type: 'cron',
  source: 'readonly',
  prefix: 'cron',
  syntax: '${cron(expression)}',
  description: 'Resolves cron expressions. Examples: ${cron("every 5 minutes"}, ${cron("weekdays")}, ${cron("at 9:30")}',
  match: cronRefSyntax,
  resolver: getValueFromCron,
  // Backward-compat: the human-readable parser now lives in @davidwells/human-cron
  _parseCronExpression: parseCron
}
