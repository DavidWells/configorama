// Applies setup wizard answer groups onto an in-memory resolution context.
// The caller chooses the env target (process.env or a plain object copy).
const dotProp = require('dot-prop')

/**
 * @typedef {Object} ResolutionContext
 * @property {Object.<string, any>} options - options hive for ${opt:...} variables
 * @property {Object.<string, any>} env - env target; pass process.env or a plain object
 * @property {Object.<string, any>} config - config object under resolution
 */

/**
 * Apply answers from the setup wizard to a resolution context
 * @param {ResolutionContext} context - context to mutate
 * @param {Object} [answers] - answer groups { options, env, self, dotProp }
 * @returns {ResolutionContext} the same context, mutated
 */
function applyAnswers(context, answers) {
  if (!answers) return context

  if (answers.options) {
    Object.assign(context.options, answers.options)
  }
  if (answers.env) {
    Object.assign(context.env, answers.env)
  }
  if (answers.self) {
    Object.assign(context.config, answers.self)
  }
  if (answers.dotProp) {
    for (const [key, value] of Object.entries(answers.dotProp)) {
      dotProp.set(context.config, key, value)
    }
  }

  return context
}

module.exports = {
  applyAnswers,
}
