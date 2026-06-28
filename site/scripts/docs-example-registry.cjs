const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

module.exports = {
  repoRoot,
  examples: {
    'getting-started-config': {
      src: 'tests/docs-examples/getting-started.config.yml',
      marker: 'getting-started-config',
      lang: 'yaml'
    },
    'getting-started-output': {
      src: 'tests/docs-examples/getting-started.output.md',
      marker: 'getting-started-output',
      lang: 'json'
    },
    'file-references-config': {
      src: 'tests/docs-examples/file-references.config.yml',
      marker: 'file-references-config',
      lang: 'yaml'
    },
    'requirements-config': {
      src: 'tests/docs-examples/requirements.config.yml',
      marker: 'requirements-config',
      lang: 'yaml'
    },
    'safe-inspection-config': {
      src: 'tests/docs-examples/safe-inspection.config.yml',
      marker: 'safe-inspection-config',
      lang: 'yaml'
    },
    'variable-env': {
      src: 'tests/docs-examples/variable-types.config.yml',
      marker: 'variable-env',
      lang: 'yaml'
    },
    'variable-options': {
      src: 'tests/docs-examples/variable-types.config.yml',
      marker: 'variable-options',
      lang: 'yaml'
    },
    'variable-param': {
      src: 'tests/docs-examples/variable-types.config.yml',
      marker: 'variable-param',
      lang: 'yaml'
    },
    'variable-self': {
      src: 'tests/docs-examples/variable-types.config.yml',
      marker: 'variable-self',
      lang: 'yaml'
    },
    'variable-file': {
      src: 'tests/docs-examples/variable-types.config.yml',
      marker: 'variable-file',
      lang: 'yaml'
    },
    'variable-text': {
      src: 'tests/docs-examples/variable-types.config.yml',
      marker: 'variable-text',
      lang: 'yaml'
    },
    'variable-git': {
      src: 'tests/docs-examples/variable-types.config.yml',
      marker: 'variable-git',
      lang: 'yaml'
    },
    'variable-cron': {
      src: 'tests/docs-examples/variable-types.config.yml',
      marker: 'variable-cron',
      lang: 'yaml'
    },
    'variable-eval': {
      src: 'tests/docs-examples/variable-types.config.yml',
      marker: 'variable-eval',
      lang: 'yaml'
    },
    'variable-if': {
      src: 'tests/docs-examples/variable-types.config.yml',
      marker: 'variable-if',
      lang: 'yaml'
    }
  }
}
