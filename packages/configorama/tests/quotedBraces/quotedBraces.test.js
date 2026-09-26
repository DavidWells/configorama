/* Braces and dollar signs inside quoted fallback literals and inside values resolved into */
/* another variable are plain text: they never end, start, or break a ${...} expression.  */
/* eslint-disable no-template-curly-in-string */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const { spawnSync } = require('child_process')
const configorama = require('../../src')
const { resolveYamlText } = require('../utils')

const HEADER = `stage: dev
tpl: '{name}-svc'
money: '$5'
`

/**
 * Resolve one value next to the shared header keys
 * @param {string} value - YAML value text for key v
 * @param {object} [settings] - configorama settings
 * @returns {Promise<any>} The resolved v
 */
async function resolveValue(value, settings) {
  const config = await resolveYamlText(`${HEADER}v: ${value}\n`, settings)
  return config.v
}

// ==========================================
// Quoted fallback literals
// ==========================================

test('closing brace inside a quoted fallback', async () => {
  assert.is(await resolveValue(`"\${opt:nope, 'a}b'}"`), 'a}b')
  assert.is(await resolveValue(`"\${opt:pw, 'p@ss}word'}"`), 'p@ss}word')
})

test('braces inside a quoted fallback', async () => {
  assert.is(await resolveValue(`"\${opt:tpl, '{name}-svc'}"`), '{name}-svc')
  assert.is(await resolveValue(`'\${opt:tpl, "{name}"}'`), '{name}')
})

test('dollar sign inside a quoted fallback', async () => {
  assert.is(await resolveValue(`"\${opt:price, '$5'}"`), '$5')
  assert.is(await resolveValue(`"\${opt:price, 'a$b'}"`), 'a$b')
})

test('JSON text as a quoted fallback', async () => {
  assert.is(await resolveValue(`'\${opt:json, ''{"a":1}''}'`), '{"a":1}')
})

test('quoted fallback with braces composed into text', async () => {
  assert.is(await resolveValue(`"pre-\${opt:nope, '{a}'}-post"`), 'pre-{a}-post')
  assert.is(await resolveValue(`"\${stage}/\${opt:nope, 'a}b'}/\${stage}"`), 'dev/a}b/dev')
})

test('quoted fallback with braces nested two and three deep', async () => {
  assert.is(await resolveValue(`"\${opt:a, \${opt:b, '{x}'}}"`), '{x}')
  assert.is(await resolveValue(`"\${opt:a, \${opt:b, \${opt:c, '}{'}}}"`), '}{')
})

test('a variable inside a quoted fallback still resolves next to braces', async () => {
  assert.is(await resolveValue(`"\${opt:nope, '{\${stage}}'}"`), '{dev}')
  assert.is(await resolveValue(`"\${opt:nope, '\${stage}-{x}'}"`), 'dev-{x}')
})

test('quoted fallback with braces inside a three-item fallback list', async () => {
  assert.is(await resolveValue(`"\${opt:a, \${opt:b, '{x}'}, 'z'}"`), '{x}')
  assert.is(await resolveValue(`"pre \${opt:a, \${opt:b, '{x}'}, 'z'} post"`), 'pre {x} post')
  assert.is(await resolveValue(`"\${opt:nope, \${UnknownRef}, '{x}'}"`, { allowUnknownVars: true }), '{x}')
})

test('escaped quote inside a single-quoted fallback with braces', async () => {
  assert.is(await resolveValue(`"\${opt:nope, 'don\\\\'t {x}'}"`), "don't {x}")
})

test('a value that looks like a missing variable fails like one written directly', async () => {
  process.env.QUOTED_BRACES_TPL = '${notavar}'
  try {
    for (const value of ['${opt:nope, ${env:QUOTED_BRACES_TPL}}', '${opt:nope, ${notavar}}']) {
      try {
        await resolveValue(value)
        assert.unreachable(`should throw for ${value}`)
      } catch (err) {
        assert.instance(err, Error)
        assert.match(err.message, /notavar/)
        assert.not.match(err.message, /__CFG_/)
      }
    }
  } finally {
    delete process.env.QUOTED_BRACES_TPL
  }
})

test('a provided value still wins over a quoted fallback with braces', async () => {
  assert.is(await resolveValue(`"\${opt:tpl, '{name}'}"`, { options: { tpl: 'given' } }), 'given')
})

// ==========================================
// Resolved values with braces inside another variable
// ==========================================

test('value with braces used as a fallback', async () => {
  assert.is(await resolveValue('${opt:nope, ${self:tpl}}'), '{name}-svc')
  assert.is(await resolveValue('${opt:nope, ${opt:nope2, ${self:tpl}}}'), '{name}-svc')
  assert.is(await resolveValue('${opt:nope, ${self:money}}'), '$5')
})

test('value with braces used as a fallback inside text', async () => {
  assert.is(await resolveValue('x-${opt:nope, ${self:tpl}}-y'), 'x-{name}-svc-y')
})

test('value with braces outside any variable is unchanged', async () => {
  assert.is(await resolveValue('pre-${self:tpl}'), 'pre-{name}-svc')
})

// ==========================================
// Filters, functions, eval/if see the real text
// ==========================================

test('filters run on the real text of a quoted fallback with braces', async () => {
  assert.is(await resolveValue(`"\${opt:nope, '{AB}' | toLowerCase}"`), '{ab}')
  assert.is(await resolveValue(`"\${opt:nope, '{ab}' | toUpperCase}"`), '{AB}')
  assert.is(await resolveValue('${opt:nope, ${self:tpl} | toUpperCase}'), '{NAME}-SVC')
})

test('function args with braces', async () => {
  assert.equal(await resolveValue(`"\${split('{a},{b}', ',')}"`), ['{a}', '{b}'])
  assert.equal(await resolveValue('${split(${self:tpl}, -)}'), ['{name}', 'svc'])
})

test('filter args with braces', async () => {
  assert.is(await resolveValue(`"\${opt:nope, '{a}' | oneOf('{a}', 'b')}"`), '{a}')
  assert.is(await resolveValue(`"\${self:tpl | oneOf('{name}-svc', 'x')}"`), '{name}-svc')
})

test('if/eval comparisons against strings with braces', async () => {
  assert.is(await resolveValue(`'\${if("\${self:tpl}" === "{name}-svc") ? "yes" : "no"}'`), 'yes')
  assert.is(await resolveValue(`'\${eval("\${self:tpl}" === "{name}-svc")}'`), true)
  // Ordering sees the real { (after letters), not placeholder text
  assert.is(await resolveValue(`'\${eval("\${self:tpl}" < "a")}'`), false)
  assert.is(await resolveValue(`'\${if("\${self:tpl}" === "{name}-svc") ? "{yes}" : "no"}'`), '{yes}')
})

// ==========================================
// Other formats, metadata, and no placeholder leaks
// ==========================================

test('JSON config: quoted fallback with braces', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-quoted-braces-'))
  try {
    const file = path.join(dir, 'config.json')
    fs.writeFileSync(file, JSON.stringify({
      tpl: '{name}-svc',
      a: "${opt:nope, 'a}b'}",
      b: '${opt:nope, ${self:tpl}}',
      c: "pre-${opt:nope, '{x}'}-post",
    }))
    const config = await configorama(file, { options: {} })
    assert.equal(config, { tpl: '{name}-svc', a: 'a}b', b: '{name}-svc', c: 'pre-{x}-post' })
    const syncConfig = configorama.sync(file, { options: {} })
    assert.equal(syncConfig, config)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('metadata shows the original variable text, not placeholders', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-quoted-braces-meta-'))
  try {
    const file = path.join(dir, 'config.yml')
    fs.writeFileSync(file, `v: "\${opt:nope, 'a}b'}"\n`)
    const result = await configorama(file, { options: {}, returnMetadata: true })
    assert.is(result.config.v, 'a}b')
    assert.not.match(JSON.stringify(result.metadata), /__CFG_/)
    assert.match(JSON.stringify(result.metadata), /a}b/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('text that looks like a placeholder is left as written', async () => {
  const config = await resolveYamlText(`${HEADER}plain: __CFG_C123__
composed: "\${stage} __CFG_C123__"
quoted: "\${opt:nope, '__CFG_C125__ }'}"
`)
  assert.is(config.plain, '__CFG_C123__')
  assert.is(config.composed, 'dev __CFG_C123__')
  assert.is(config.quoted, '__CFG_C125__ }')
})

test('metadata variables record the whole variable and its brace default', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-quoted-braces-vars-'))
  try {
    const file = path.join(dir, 'config.yml')
    fs.writeFileSync(file, `v: "\${opt:nope, 'a}b'}"\n`)
    const result = await configorama(file, { options: {}, returnMetadata: true })
    const entries = result.metadata.variables["${opt:nope, 'a}b'}"]
    assert.ok(entries, `variables keys: ${Object.keys(result.metadata.variables)}`)
    assert.is(entries[0].defaultValue, 'a}b')
    assert.equal(entries[0].resolveOrder, ['opt:nope', 'a}b (default)'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('sync metadata and originalConfig show the original text', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-quoted-braces-sync-'))
  try {
    const file = path.join(dir, 'config.yml')
    fs.writeFileSync(file, `v: "\${opt:nope, 'a}b'}"\n`)
    const result = configorama.sync(file, { options: {}, returnMetadata: true })
    assert.is(result.config.v, 'a}b')
    assert.not.match(JSON.stringify(result.metadata), /__CFG_/)
    assert.is(result.originalConfig.v, "${opt:nope, 'a}b'}")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('async originalConfig shows the original text', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-quoted-braces-orig-'))
  try {
    const file = path.join(dir, 'config.yml')
    fs.writeFileSync(file, `v: "\${opt:nope, 'a}b'}"\n`)
    const result = await configorama(file, { options: {}, returnMetadata: true })
    assert.is(result.originalConfig.v, "${opt:nope, 'a}b'}")
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI --info and --verbose output shows no placeholders', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-quoted-braces-cli-'))
  try {
    const file = path.join(dir, 'config.yml')
    fs.writeFileSync(file, `a: "\${opt:nope, 'a}b'}"\n`)
    for (const flag of ['--info', '--verbose']) {
      const result = spawnSync(process.execPath, [path.join(__dirname, '../../cli.js'), file, flag], { encoding: 'utf8' })
      assert.is(result.status, 0, result.stderr)
      assert.not.match(result.stdout + result.stderr, /__CFG_/, `${flag} output leaked placeholders`)
      assert.match(result.stdout, /a}b/)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('no placeholder text leaks into any resolved value', async () => {
  const config = await resolveYamlText(`${HEADER}a: "\${opt:nope, 'a}b'}"
b: \${opt:nope, \${self:tpl}}
c: "pre-\${opt:nope, '{a}'}-post"
d: "\${opt:nope, '{AB}' | toLowerCase}"
e: "\${opt:a, \${opt:b, '$\${stage}'}}"
`)
  assert.not.match(JSON.stringify(config), /__CFG_/)
})

test.run()
