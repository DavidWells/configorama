// Registry of docs examples: the single source of truth linking a source fixture
// (tests/docs-examples/sources/<id>.yml) to the docs page + marker it renders into
// and the options/env it needs to resolve. Consumed by both the test (asserts each
// resolves to its golden output) and scripts/docs-examples.js (injects into MDX).

// `dynamic` entries resolve non-deterministically (e.g. git), so instead of a golden
// they carry `displayOutput` for the docs and the test only checks the shape.
/** @type {Array<{ id: string, page: string, options?: Object, env?: Object, dynamic?: boolean, displayOutput?: Object }>} */
const registry = [
  { id: 'variable-env', page: 'variables/env.mdx' },
  { id: 'variable-options', page: 'variables/options.mdx', options: { stage: 'prod' } },
  { id: 'variable-self', page: 'variables/self.mdx', options: { stage: 'prod' } },
  { id: 'variable-cron', page: 'variables/cron.mdx' },
  { id: 'variable-eval', page: 'variables/eval.mdx', options: { stage: 'prod', replicas: 3 } },
  { id: 'variable-if', page: 'variables/if.mdx', options: { stage: 'prod' } },
  { id: 'variable-text', page: 'variables/text.mdx' },
  { id: 'variable-file', page: 'variables/file.mdx' },
  { id: 'variable-param', page: 'variables/params.mdx', options: { param: ['domain=configorama.dev', 'databasePort=6543'] } },
  { id: 'getting-started-config', page: 'index.mdx', options: { stage: 'prod' } },
  { id: 'file-references-config', page: 'guides/file-references.mdx', options: { stage: 'prod' } },
  { id: 'variable-git', page: 'variables/git.mdx', dynamic: true, displayOutput: { branchName: 'main', shortSha: '1a2b3c4' } },
]

module.exports = { registry }
