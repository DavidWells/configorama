/**
 * Tests for preResolveVariable utility
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { preResolveSingle, preResolveString, hasUnresolvedVars } = require('./preResolveVariable')

// Default variable syntax (matches configorama default)
const variableSyntax = /\$\{([\s\S]+?)\}/g

// Test hasUnresolvedVars
test('hasUnresolvedVars - detects variable syntax', () => {
  assert.is(hasUnresolvedVars('${foo}', variableSyntax), true)
  assert.is(hasUnresolvedVars('${self:bar}', variableSyntax), true)
  assert.is(hasUnresolvedVars('hello ${world}', variableSyntax), true)
  assert.is(hasUnresolvedVars('no variables here', variableSyntax), false)
  assert.is(hasUnresolvedVars('', variableSyntax), false)
  assert.is(hasUnresolvedVars(null, variableSyntax), false)
  assert.is(hasUnresolvedVars(123, variableSyntax), false)
})

// Test preResolveSingle with config refs
test('preResolveSingle - resolves simple config path', async () => {
  const config = { foo: 'bar', nested: { value: 42 } }
  const ctx = { config, variableSyntax }
  assert.is(await preResolveSingle('foo', ctx), 'bar')
  assert.is(await preResolveSingle('nested.value', ctx), 42)
  assert.is(await preResolveSingle('notfound', ctx), undefined)
})

test('preResolveSingle - resolves self: refs', async () => {
  const config = { appName: 'MyApp', settings: { port: 3000 } }
  const ctx = { config, variableSyntax }
  assert.is(await preResolveSingle('self:appName', ctx), 'MyApp')
  assert.is(await preResolveSingle('self:settings.port', ctx), 3000)
  assert.is(await preResolveSingle('self:missing', ctx), undefined)
})

test('preResolveSingle - resolves env: refs', async () => {
  process.env.TEST_PRE_RESOLVE = 'testvalue'
  const ctx = { config: {}, variableSyntax }
  assert.is(await preResolveSingle('env:TEST_PRE_RESOLVE', ctx), 'testvalue')
  assert.is(await preResolveSingle('env:DEFINITELY_NOT_SET_12345', ctx), undefined)
  delete process.env.TEST_PRE_RESOLVE
})

test('preResolveSingle - skips values with unresolved vars', async () => {
  const config = { dynamic: '${other}' }
  const ctx = { config, variableSyntax }
  assert.is(await preResolveSingle('dynamic', ctx), undefined)
  assert.is(await preResolveSingle('self:dynamic', ctx), undefined)
})

// Test preResolveString
test('preResolveString - resolves variables in string', async () => {
  const config = { name: 'World', count: 5 }
  const ctx = { config, variableSyntax }
  const result = await preResolveString('Hello ${name}, count: ${count}', ctx)
  assert.is(result, 'Hello World, count: 5')
})

test('preResolveString - formats arrays as comma-separated', async () => {
  const config = { items: ['a', 'b', 'c'] }
  const ctx = { config, variableSyntax }
  const result = await preResolveString('Items: ${items}', ctx)
  assert.is(result, 'Items: a, b, c')
})

test('preResolveString - handles fallback values', async () => {
  const config = { existing: 'found' }
  const ctx = { config, variableSyntax }
  assert.is(await preResolveString('${existing, "default"}', ctx), 'found')
  assert.is(await preResolveString('${missing, "default"}', ctx), 'default')
  assert.is(await preResolveString('${missing, 42}', ctx), '42')
})

test('preResolveString - leaves unresolvable vars unchanged', async () => {
  const ctx = { config: {}, variableSyntax }
  const result = await preResolveString('Value: ${unknown}', ctx)
  assert.is(result, 'Value: ${unknown}')
})

test('preResolveString - handles env: in strings', async () => {
  process.env.TEST_STRING_RESOLVE = 'envval'
  const ctx = { config: {}, variableSyntax }
  const result = await preResolveString('Env: ${env:TEST_STRING_RESOLVE}', ctx)
  assert.is(result, 'Env: envval')
  delete process.env.TEST_STRING_RESOLVE
})

test('preResolveString - handles self: in strings', async () => {
  const config = { version: '1.0.0' }
  const ctx = { config, variableSyntax }
  const result = await preResolveString('Version: ${self:version}', ctx)
  assert.is(result, 'Version: 1.0.0')
})

test.run()
