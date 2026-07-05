const { test } = require('uvu')
const assert = require('uvu/assert')
const { buildIntrospection, riskForVariable } = require('./model')
const { buildAuditReport } = require('./audit')
const { formatGraph } = require('./graph')

test('riskForVariable classifies eval as data-flow and js file refs as executable', () => {
  assert.is(riskForVariable('eval', 'eval(1 + 1)'), 'data_flow_expression')
  assert.is(riskForVariable('if', 'if(true)'), 'data_flow_expression')
  assert.is(riskForVariable('file', 'file(./config.js)'), 'executable_code')
  assert.is(riskForVariable('file', 'file(./config.yml)'), 'local_file_read')
})

test('buildIntrospection creates deterministic nodes edges and dynamic diagnostics', () => {
  const graph = buildIntrospection({
    uniqueVariables: {
      'file(./${opt:stage}.yml)': {
        variable: 'file(./${opt:stage}.yml)',
        variableType: 'file',
        variableSourceType: 'config',
        occurrences: [{ path: 'database' }],
        innerVariables: [{ variable: 'opt:stage', variableType: 'options' }]
      },
      'opt:stage': {
        variable: 'opt:stage',
        variableType: 'options',
        variableSourceType: 'user',
        occurrences: [{ path: 'stage' }]
      }
    },
    fileDependencies: {
      byConfigPath: []
    }
  }, {
    requirements: [{ variable: 'opt:stage', sensitive: false, required: true, default: null }]
  })

  assert.is(graph.schemaVersion, 1)
  assert.ok(graph.nodes.some(node => node.id === 'variable:file(./${opt:stage}.yml)'))
  assert.ok(graph.edges.some(edge => edge.kind === 'depends_on'))
  assert.is(graph.diagnostics[0].code, 'dynamic_file_target')
})

test('buildIntrospection redacts sensitive requirement defaults', () => {
  const graph = buildIntrospection({
    uniqueVariables: {
      'env:API_KEY': {
        variable: 'env:API_KEY',
        variableType: 'env',
        variableSourceType: 'user',
        occurrences: [{ path: 'apiKey' }]
      }
    },
    fileDependencies: { byConfigPath: [] }
  }, {
    requirements: [{
      variable: 'env:API_KEY',
      sensitive: true,
      required: false,
      default: 'secret-value',
      description: 'API key'
    }]
  })

  const node = graph.nodes.find(item => item.variable === 'env:API_KEY')
  assert.is(node.sensitive, true)
  assert.is(node.default, '********')
})

test('audit report sorts executable findings before lower severity surfaces', () => {
  const report = buildAuditReport({
    nodes: [
      { id: 'variable:eval(1)', risk: 'data_flow_expression', severity: 'low', kind: 'variable' },
      { id: 'variable:file(./x.js)', risk: 'executable_code', severity: 'high', kind: 'executable' }
    ],
    diagnostics: []
  })

  assert.is(report.summary.total, 2)
  assert.is(report.findings[0].severity, 'high')
})

test('formatGraph emits mermaid and dot formats', () => {
  const graph = {
    nodes: [{ id: 'configPath:stage', label: 'stage' }, { id: 'variable:opt:stage', variable: 'opt:stage' }],
    edges: [{ from: 'configPath:stage', to: 'variable:opt:stage', kind: 'uses' }]
  }

  assert.match(formatGraph(graph, 'mermaid'), /graph TD/)
  assert.match(formatGraph(graph, 'dot'), /digraph configorama/)
})

test.run()
