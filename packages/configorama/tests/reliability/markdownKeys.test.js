const { test } = require('uvu')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const configorama = require('../../src')
const { cases, temporary } = require('./cases')
const { parseFileContents, getBodyContentKey } = require('../../src/utils/parsing/parse')
for (const name of ['markdown-own-key', 'markdown-body-collision']) test(name, cases[name].run)
for (const format of ['yaml', 'toml', 'json']) test(`body collision preserves ${format} frontmatter`, () => temporary(async dir => {
  const data = { hasOwnProperty: 'data', _content: '${opt:v}', _body: 'other', _body_1: 'occupied' }
  const text = format === 'json' ? `---\n${JSON.stringify(data)}\n---\nBody` : format === 'toml'
    ? '+++\nhasOwnProperty="data"\n_content="${opt:v}"\n_body="other"\n_body_1="occupied"\n+++\nBody'
    : '---\nhasOwnProperty: data\n_content: ${opt:v}\n_body: other\n_body_1: occupied\n---\nBody'
  const file = path.join(dir, 'config.md'); fs.writeFileSync(file, text)
  const parsed = parseFileContents({ contents: text, filePath: file })
  assert.equal(getBodyContentKey(parsed), '_body_2')
  for (const resolve of [configorama, configorama.sync]) {
    const output = await resolve(file, { options: { v: 'ok' }, returnMetadata: true })
    assert.deepEqual(output.config, { ...data, _content: 'ok', _body_2: 'Body' })
    assert.equal(output.originalConfig._content, '${opt:v}')
  }
}))
test('plain object body-named data fields are resolved normally', async () => {
  assert.deepEqual(await configorama({ value: 'ok', _body: '${self:value}', _content: '${self:value}' }), { value: 'ok', _body: 'ok', _content: 'ok' })
})
test('Markdown body stays opaque without changing literal private characters', () => temporary(async dir => {
  const file = path.join(dir, 'config.md'); const body = '${opt:missing}\n\uE001\nhelp("${opt:other}")'
  fs.writeFileSync(file, `---\nvalue: \${opt:v}\n---\n${body}`)
  const output = await configorama(file, { options: { v: 'ok' } })
  assert.deepEqual(output, { value: 'ok', _content: body })
}))
test.run()
