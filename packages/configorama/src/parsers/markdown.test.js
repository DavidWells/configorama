/* eslint-disable no-template-curly-in-string */
// Unit tests for markdown frontmatter extraction and format detection
const { test } = require('uvu')
const assert = require('uvu/assert')
const { extractFrontmatter, detectSyntax } = require('./markdown')

// --- detectSyntax tests ---

test('detectSyntax: JSON detected by leading {', () => {
  assert.is(detectSyntax('{ "title": "hello" }'), 'json')
})

test('detectSyntax: TOML detected by [section] header', () => {
  assert.is(detectSyntax('title = "hello"\n[section]\nkey = "val"'), 'toml')
})

test('detectSyntax: TOML detected by [dotted.section] header', () => {
  assert.is(detectSyntax('[my.config]\nkey = "val"'), 'toml')
})

test('detectSyntax: defaults to yaml', () => {
  assert.is(detectSyntax('title: hello\ndescription: world'), 'yaml')
})

test('detectSyntax: yaml even with empty content', () => {
  assert.is(detectSyntax(''), 'yaml')
})

// --- extractFrontmatter: YAML with --- delimiters ---

test('extract YAML frontmatter with --- delimiters', () => {
  const input = '---\ntitle: hello\nstage: ${opt:stage}\n---\n\n# My Doc\n\nBody content here.'
  const result = extractFrontmatter(input)
  assert.is(result.format, 'yaml')
  assert.is(result.frontmatterContent, 'title: hello\nstage: ${opt:stage}')
  assert.is(result.content, '\n\n# My Doc\n\nBody content here.')
})

// --- extractFrontmatter: TOML with +++ delimiters ---

test('extract TOML frontmatter with +++ delimiters', () => {
  const input = '+++\ntitle = "hello"\nstage = "${opt:stage}"\n+++\n\n# My Doc\n\nBody.'
  const result = extractFrontmatter(input)
  assert.is(result.format, 'toml')
  assert.is(result.frontmatterContent, 'title = "hello"\nstage = "${opt:stage}"')
  assert.is(result.content, '\n\n# My Doc\n\nBody.')
})

// --- extractFrontmatter: TOML detected inside --- delimiters ---

test('extract TOML detected inside --- delimiters via [section]', () => {
  const input = '---\n[metadata]\ntitle = "hello"\n---\n\nBody.'
  const result = extractFrontmatter(input)
  assert.is(result.format, 'toml')
  assert.is(result.frontmatterContent, '[metadata]\ntitle = "hello"')
  assert.is(result.content, '\n\nBody.')
})

// --- extractFrontmatter: JSON detected inside --- delimiters ---

test('extract JSON detected inside --- delimiters via leading {', () => {
  const input = '---\n{\n  "title": "hello"\n}\n---\n\nBody.'
  const result = extractFrontmatter(input)
  assert.is(result.format, 'json')
  assert.is(result.frontmatterContent, '{\n  "title": "hello"\n}')
  assert.is(result.content, '\n\nBody.')
})

// --- extractFrontmatter: HTML comment frontmatter ---

test('extract hidden comment frontmatter <!-- -->', () => {
  const input = '<!--\ntitle: hello\nstage: dev\n-->\n\n# Doc\n\nBody.'
  const result = extractFrontmatter(input)
  assert.is(result.format, 'yaml')
  assert.is(result.frontmatterContent, 'title: hello\nstage: dev')
  assert.is(result.content, '\n\n# Doc\n\nBody.')
})

test('comment frontmatter not detected when not at position 0', () => {
  const input = '\n<!--\ntitle: hello\n-->\n\nBody.'
  const result = extractFrontmatter(input)
  assert.is(result.frontmatterContent, null)
  assert.is(result.format, null)
  assert.is(result.content, '\n<!--\ntitle: hello\n-->\n\nBody.')
})

// --- extractFrontmatter: no frontmatter ---

test('no frontmatter returns null + full content', () => {
  const input = '# Just a markdown file\n\nNo frontmatter here.'
  const result = extractFrontmatter(input)
  assert.is(result.frontmatterContent, null)
  assert.is(result.format, null)
  assert.is(result.content, '# Just a markdown file\n\nNo frontmatter here.')
})

// --- Multiple --- in body don't confuse extraction ---

test('thematic breaks in body do not confuse extraction', () => {
  const input = '---\ntitle: hello\n---\n\nSome text\n\n---\n\nMore text after thematic break.'
  const result = extractFrontmatter(input)
  assert.is(result.format, 'yaml')
  assert.is(result.frontmatterContent, 'title: hello')
  assert.is(result.content, '\n\nSome text\n\n---\n\nMore text after thematic break.')
})

// --- Edge cases ---

test('empty file returns no frontmatter', () => {
  const result = extractFrontmatter('')
  assert.is(result.frontmatterContent, null)
  assert.is(result.format, null)
  assert.is(result.content, '')
})

test('--- only at start with no closing returns no frontmatter', () => {
  const input = '---\ntitle: hello\nno closing delimiter'
  const result = extractFrontmatter(input)
  assert.is(result.frontmatterContent, null)
  assert.is(result.format, null)
  assert.is(result.content, '---\ntitle: hello\nno closing delimiter')
})

test('+++ only at start with no closing returns no frontmatter', () => {
  const input = '+++\ntitle = "hello"\nno closing delimiter'
  const result = extractFrontmatter(input)
  assert.is(result.frontmatterContent, null)
  assert.is(result.format, null)
  assert.is(result.content, '+++\ntitle = "hello"\nno closing delimiter')
})

test.run()
