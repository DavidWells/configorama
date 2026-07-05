// Orchestrates the config setup wizard: analyze config, prompt for missing values,
// and return grouped answers plus a redacted copy safe for display.
const path = require('path')
const { runConfigWizard } = require('../ui/configWizard')
const { buildConfigRequirements } = require('../requirements/configRequirements')
const { redactUserInputsByRequirements } = require('../redaction/setupRedaction')

const ANSWER_GROUPS = ['options', 'env', 'self', 'dotProp']

/**
 * @typedef {Object} SetupAnswers
 * @property {Object.<string, any>} options - answers for ${opt:...} variables
 * @property {Object.<string, any>} env - answers for ${env:...} variables
 * @property {Object.<string, any>} self - answers for ${self:...} variables
 * @property {Object.<string, any>} dotProp - answers for dot-prop config references
 */

/**
 * @typedef {Object} SetupResult
 * @property {number} schemaVersion - result shape version
 * @property {string|null} configPath - absolute path to the config file, null for object input
 * @property {Array<Object>} requirements - prompt requirements from buildConfigRequirements
 * @property {SetupAnswers} answers - raw user answers grouped by variable type
 * @property {SetupAnswers} redactedAnswers - answers with sensitive values redacted for display
 */

/**
 * Ensure every answer group exists so callers get a stable shape
 * @param {Object|undefined} userInputs - answers from the prompt renderer
 * @returns {SetupAnswers} answers with all groups present
 */
function normalizeAnswerGroups(userInputs) {
  const normalized = {}
  for (const group of ANSWER_GROUPS) {
    normalized[group] = Object.assign({}, userInputs && userInputs[group])
  }
  return normalized
}

/**
 * Run the setup flow: analyze the config, prompt for unresolved values, return answers.
 * Pure orchestration - applies nothing to process.env, config, or disk.
 * @param {string|Object} configPathOrObject - path to config file or raw config object
 * @param {Object} [settings] - configorama settings, plus:
 * @param {Function} [settings.promptRenderer] - replaces the interactive wizard (mocks, answers files)
 * @param {Object} [settings.streams] - stream overrides forwarded to the prompt renderer
 * @param {Object} deps - injected dependencies
 * @param {Function} deps.analyze - configorama.analyze, injected to avoid a require cycle
 * @returns {Promise<SetupResult>} collected answers and requirements
 */
async function runSetup(configPathOrObject, settings = {}, deps = {}) {
  const { analyze } = deps
  if (typeof analyze !== 'function') {
    throw new Error('setup engine requires an analyze function')
  }
  const { promptRenderer, streams, ...analyzeSettings } = settings

  const analysis = await analyze(configPathOrObject, analyzeSettings)
  const requirements = buildConfigRequirements(analysis)

  const configPath = typeof configPathOrObject === 'string'
    ? path.resolve(configPathOrObject)
    : null

  const renderPrompts = promptRenderer || runConfigWizard
  const userInputs = await renderPrompts(analysis, analysis.originalConfig || {}, configPath || '', streams)

  const answers = normalizeAnswerGroups(userInputs)
  const redactedAnswers = normalizeAnswerGroups(redactUserInputsByRequirements(answers, requirements))

  return {
    schemaVersion: 1,
    configPath,
    requirements,
    answers,
    redactedAnswers,
  }
}

module.exports = {
  runSetup,
  normalizeAnswerGroups,
}
