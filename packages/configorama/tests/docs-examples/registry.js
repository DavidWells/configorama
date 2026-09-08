// Registry of docs examples: the single source of truth linking a source fixture
// (tests/docs-examples/sources/<id>.yml) to the docs page + marker it renders into
// and the options/env it needs to resolve. Consumed by both the test (asserts each
// resolves to its golden output) and scripts/docs-examples.js (injects into MDX).

/** @type {Array<{ id: string, page: string, options?: Object, env?: Object }>} */
const registry = [
  { id: 'variable-env', page: 'variables/env.mdx' },
  { id: 'variable-options', page: 'variables/options.mdx', options: { stage: 'prod' } },
  { id: 'variable-self', page: 'variables/self.mdx', options: { stage: 'prod' } },
  { id: 'variable-cron', page: 'variables/cron.mdx' },
  { id: 'variable-eval', page: 'variables/eval.mdx', options: { stage: 'prod', replicas: 3 } },
  { id: 'variable-if', page: 'variables/if.mdx', options: { stage: 'prod' } },
  { id: 'variable-text', page: 'variables/text.mdx' },
]

module.exports = { registry }
