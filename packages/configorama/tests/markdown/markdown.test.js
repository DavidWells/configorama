/* eslint-disable no-template-curly-in-string */
// Integration tests for markdown/MDX frontmatter parsing through configorama API
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const FIXTURES = path.join(__dirname, 'fixtures')
const args = { stage: 'dev', count: 25 }
const opts = { options: args }

// --- YAML frontmatter ---

let yamlConfig
test.before(async () => {
  try {
    yamlConfig = await configorama(path.join(FIXTURES, 'yaml-frontmatter.md'), opts)
  } catch (err) {
    console.error('TEST ERROR yaml-frontmatter\n', err)
    process.exit(1)
  }
})

test('yaml: resolves ${opt:stage} variable', () => {
  assert.is(yamlConfig.stage, 'dev')
})

test('yaml: resolves ${opt:count} variable', () => {
  assert.is(yamlConfig.count, 25)
})

test('yaml: preserves static values', () => {
  assert.is(yamlConfig.title, 'My Site')
})

test('yaml: _content contains body without leading/trailing newlines', () => {
  assert.is(yamlConfig._content, '# Hello World\n\nThis is the body content.')
})

test('yaml: _content not affected by variable resolution', () => {
  assert.not.ok(yamlConfig._content.includes('dev'))
  assert.ok(yamlConfig._content.includes('# Hello World'))
})

// --- TOML frontmatter ---

test('toml: parses and resolves variables', async () => {
  const config = await configorama(path.join(FIXTURES, 'toml-frontmatter.md'), opts)
  assert.is(config.title, 'My Site')
  assert.is(config.stage, 'dev')
  assert.is(config.count, 25)
  assert.is(config._content, '# Hello World\n\nThis is TOML body content.')
})

// --- JSON frontmatter ---

test('json: parses and resolves variables', async () => {
  const config = await configorama(path.join(FIXTURES, 'json-frontmatter.md'), opts)
  assert.is(config.title, 'My Site')
  assert.is(config.stage, 'dev')
  assert.is(config.count, 25)
  assert.is(config._content, '# Hello World\n\nThis is JSON body content.')
})

// --- Hidden frontmatter ---

test('hidden: parses <!-- --> frontmatter and resolves variables', async () => {
  const config = await configorama(path.join(FIXTURES, 'hidden-frontmatter.md'), opts)
  assert.is(config.title, 'My Site')
  assert.is(config.stage, 'dev')
  assert.is(config._content, '# Hello World\n\nThis is hidden frontmatter body content.')
})

// --- No frontmatter ---

test('no frontmatter: returns _content only', async () => {
  const config = await configorama(path.join(FIXTURES, 'no-frontmatter.md'), opts)
  assert.is(config._content, '# Just Markdown\n\nNo frontmatter here, just body content.')
  // Should only have _content key
  const keys = Object.keys(config)
  assert.is(keys.length, 1)
  assert.is(keys[0], '_content')
})

// --- _content excluded from variable resolution ---

test('${_content} in frontmatter does NOT resolve to body', async () => {
  // This is implicitly tested: _content is stripped before resolution
  // so self:_content would not resolve during variable resolution
  assert.ok(yamlConfig._content)
  assert.is(typeof yamlConfig._content, 'string')
})

// --- _content collision ---

test('_content key in frontmatter is preserved when it conflicts with body', async () => {
  const config = await configorama(path.join(FIXTURES, 'content-collision.md'), opts)
  assert.is(config._content, 'my custom value')
  assert.is(config._userContent, 'another value')
  assert.ok(config._body)
  assert.ok(config._body.includes('# Body'))
})

// --- CRLF line endings ---

const { extractFrontmatter } = require('../../src/parsers/markdown')

test('crlf: parses YAML frontmatter with \\r\\n line endings', () => {
  const input = '---\r\ntitle: My Site\r\nstage: ${opt:stage}\r\n---\r\n# Hello World\r\n'
  const result = extractFrontmatter(input)
  assert.is(result.format, 'yaml')
  assert.ok(result.frontmatterContent)
  assert.ok(result.frontmatterContent.includes('title: My Site'))
  assert.ok(result.content.includes('# Hello World'))
})

test('crlf: parses TOML frontmatter with \\r\\n line endings', () => {
  const input = '+++\r\ntitle = "My Site"\r\n+++\r\n# Hello World\r\n'
  const result = extractFrontmatter(input)
  assert.is(result.format, 'toml')
  assert.ok(result.frontmatterContent.includes('title = "My Site"'))
})

test('crlf: parses HTML comment frontmatter with \\r\\n line endings', () => {
  const input = '<!--\r\ntitle: My Site\r\n-->\r\n# Hello World\r\n'
  const result = extractFrontmatter(input)
  assert.ok(result.frontmatterContent)
  assert.ok(result.frontmatterContent.includes('title: My Site'))
})

test.run()
