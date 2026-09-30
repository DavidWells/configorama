const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { resolveAlias, getAliases } = require('./resolveAlias')

const config = {
  compilerOptions: {
    baseUrl: '.',
    paths: {
      '@components': ['src/components'],
      '@utils/*': ['src/utils/*'],
      '@shared/*': ['src/shared/*'],
      '@nested/foo/*': ['src/nested/foo/*'],
      '~zaz/*': ['src/zaz/*']
    }
  }
}

let dir
function writeConfig(directory, filename = 'tsconfig.json', value = config) {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, filename), JSON.stringify(value))
}

test.before.each(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-alias-'))
  writeConfig(dir)
})

test.after.each(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

for (const [name, input, target] of [
  ['exact', '@components', 'src/components'],
  ['wildcard', '@utils/helpers', 'src/utils/helpers'],
  ['nested', '@nested/foo/bar', 'src/nested/foo/bar'],
  ['special character', '~zaz/helpers', 'src/zaz/helpers'],
]) {
  test(`resolveAlias - ${name} match`, () => {
    assert.is(resolveAlias(input, dir), path.resolve(dir, target))
  })
}

test('resolveAlias - no config file found', () => {
  fs.unlinkSync(path.join(dir, 'tsconfig.json'))
  assert.is(resolveAlias('@components', dir), '@components')
})

test('resolveAlias - no matching alias', () => {
  assert.is(resolveAlias('unknown/path', dir), 'unknown/path')
})

test('getAliases - returns correct alias information', () => {
  const result = getAliases(dir)
  assert.is(result.lookup.length, 5)
  assert.equal(result.names, ['@components', '@utils', '@shared', '@nested/foo', '~zaz'])
  assert.equal(result.lookup[1], {
    name: '@utils', absPath: path.join(dir, 'src/utils'), relPath: 'src/utils'
  })
})

test('getAliases - no config file found', () => {
  fs.unlinkSync(path.join(dir, 'tsconfig.json'))
  assert.equal(getAliases(dir), { names: [], lookup: [] })
})

test('nearest tsconfig wins over a nearer jsconfig', () => {
  const child = path.join(dir, 'child')
  writeConfig(child, 'jsconfig.json', { compilerOptions: { paths: { '@components': ['other'] } } })
  assert.is(resolveAlias('@components', child), path.resolve(dir, 'src/components'))
})

test('nearest tsconfig wins over an ancestor tsconfig', () => {
  const child = path.join(dir, 'child')
  writeConfig(child)
  assert.is(resolveAlias('@components', child), path.resolve(child, 'src/components'))
})

test('jsconfig is used when no tsconfig exists', () => {
  fs.unlinkSync(path.join(dir, 'tsconfig.json'))
  writeConfig(dir, 'jsconfig.json')
  assert.is(resolveAlias('@utils/helpers', dir), path.resolve(dir, 'src/utils/helpers'))
})

test('search still finds configs more than five ancestors away', () => {
  const child = path.join(dir, ...Array(8).fill('child'))
  fs.mkdirSync(child, { recursive: true })
  assert.is(resolveAlias('@components', child), path.resolve(dir, 'src/components'))
})

test('changed and newly created configs are observed on the next call', () => {
  fs.unlinkSync(path.join(dir, 'tsconfig.json'))
  assert.is(resolveAlias('@components', dir), '@components')
  writeConfig(dir)
  assert.is(resolveAlias('@components', dir), path.resolve(dir, 'src/components'))
  writeConfig(dir, 'tsconfig.json', { compilerOptions: { baseUrl: 'new', paths: config.compilerOptions.paths } })
  assert.is(resolveAlias('@components', dir), path.resolve(dir, 'new/src/components'))
})

test('a dangling symlink does not hide an ancestor config', () => {
  const child = path.join(dir, 'child')
  fs.mkdirSync(child)
  fs.symlinkSync(path.join(dir, 'missing.json'), path.join(child, 'tsconfig.json'))
  assert.is(resolveAlias('@components', child), path.resolve(dir, 'src/components'))
})

test('a config symlink is read relative to its discovered location', () => {
  const child = path.join(dir, 'child')
  fs.mkdirSync(child)
  fs.symlinkSync(path.join(dir, 'tsconfig.json'), path.join(child, 'tsconfig.json'))
  assert.is(resolveAlias('@components', child), path.resolve(child, 'src/components'))
})

test('invalid config still warns on each call and returns the original path', () => {
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{broken')
  const originalWarn = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args)
  try {
    assert.is(resolveAlias('@components', dir), '@components')
    assert.is(resolveAlias('@components', dir), '@components')
    assert.is(warnings.length, 2)
    assert.equal(warnings[0], warnings[1])
  } finally {
    console.warn = originalWarn
  }
})

test.run()
