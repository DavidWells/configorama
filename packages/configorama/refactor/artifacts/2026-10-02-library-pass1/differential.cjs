// Read-only before/after observations for the three approved refactor levers.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const cp = require('node:child_process')
const { createRequire } = require('node:module')
const ts = require('typescript')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '../../..')
const base = process.argv[2]
const mode = process.argv[3]
const read = file => base === 'worktree' ? fs.readFileSync(path.join(root, file), 'utf8') :
  cp.execFileSync('git', ['show', `${base}:packages/configorama/${file}`], { encoding: 'utf8', cwd: root })
function load(file, loader) {
  const filename = path.join(root, file)
  const actualRequire = createRequire(filename)
  const module = { exports: {} }
  vm.runInNewContext(read(file), {
    module, exports: module.exports, __filename: filename, __dirname: path.dirname(filename),
    console, process, Buffer, require: specifier => specifier.endsWith('/loadExecutable') ? loader : actualRequire(specifier),
  }, { filename })
  return module.exports
}
function fixture(kind, trace) {
  let exported
  const fn = function (args, context) {
    trace.push(['call', this === exported, args, context && context.env])
    if (kind === 'invoke-throw') throw new Error('invocation failure')
    const value = { nested: { value: 'ok' }, received: args }
    return kind === 'async' ? Promise.resolve(value) : value
  }
  if (['function', 'async', 'invoke-throw'].includes(kind)) exported = fn
  else if (kind === 'named') exported = { named: fn }
  else if (kind === 'config-getter' || kind === 'getter-throw') {
    exported = Object.defineProperty({}, 'config', { get() {
      trace.push(['get-config'])
      if (kind === 'getter-throw') throw new Error('getter failure')
      return fn
    } })
  } else if (kind === 'default-getter') {
    exported = Object.defineProperty({}, 'default', { get() { trace.push(['get-default']); return fn } })
  } else if (kind === 'null') exported = null
  else exported = { nested: { value: 'ok' } }
  return exported
}
async function observe(run, trace) {
  try { return { value: await run(), trace } }
  catch (error) { return { error: { name: error.name, message: error.message }, trace } }
}
async function main() {
  const results = { rootExecution: [], fileExecution: [], promptValidation: [] }
  const kinds = ['object', 'function', 'async', 'named', 'config-getter', 'default-getter', 'getter-throw', 'invoke-throw', 'null', 'load-throw']
  for (const extension of ['ts', 'tsx', 'mts', 'cts', 'mjs', 'esm', 'TS', 'MJS']) {
    for (const kind of kinds) for (const argsMode of ['object', 'factory', 'throw']) {
      const trace = []
      const parser = load('src/utils/parsing/parse.js', () => {
        trace.push(['load'])
        if (kind === 'load-throw') throw new Error('load failure')
        return fixture(kind, trace)
      })
      const dynamicArgs = argsMode === 'object' ? { option: 'yes' } : () => {
        trace.push(['args'])
        if (argsMode === 'throw') throw new Error('args failure')
        return { option: 'yes' }
      }
      results.rootExecution.push({ extension, kind, argsMode, result: await observe(() => parser.parseFileContents({
        contents: '', filePath: `/virtual/config.${extension}`, dynamicArgs, loadContext: { env: { TEST: 'env' } },
      }), trace) })
    }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-refactor-proof-'))
  try {
    for (const extension of ['js', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'mjs', 'esm']) {
      fs.writeFileSync(path.join(dir, `config.${extension}`), '// fixture\n')
      for (const kind of kinds) for (const accessor of ['', ':nested.value', ':named.nested.value']) {
        const trace = []
        const resolver = load('src/resolvers/valueFromFile.js', () => {
          trace.push(['load'])
          if (kind === 'load-throw') throw new Error('load failure')
          return fixture(kind, trace)
        })
        const ctx = {
          configPath: dir, fileRefsFound: [], opts: {}, env: { TEST: 'env' }, originalConfig: {}, config: {},
          loadContext: { origins: new Map(), configRoot: dir }, variableTypes: [], variablesKnownTypes: {},
          varPrefix: '${', varSuffix: '}', fileRefSyntax: /file\([^)]*\)/, textRefSyntax: /text\([^)]*\)/,
          getDeeperValue: (segments, value) => {
            trace.push(['deep', segments])
            return Promise.resolve(segments.reduce((current, key) => current == null ? undefined : current[key], value))
          },
        }
        const variable = `file(./config.${extension})${accessor}`
        results.fileExecution.push({ extension, kind, accessor, result: await observe(() => resolver.getValueFromFile(ctx, variable, {
          context: { value: variable, originalSource: variable, path: ['out'] },
        }), trace) })
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  const wizardFile = 'src/utils/ui/configWizard.js'
  const wizardText = read(wizardFile)
  const source = ts.createSourceFile(wizardFile, wizardText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const callbacks = []
  let factory
  const visit = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'validate') callbacks.push(node.initializer.getText(source))
    if (ts.isFunctionDeclaration(node) && node.name && node.name.text === 'createPromptValidator') factory = node.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(callbacks.length, 4)
  const realValidator = load(wizardFile, () => { throw new Error('unexpected loader') }).validateType
  for (let site = 0; site < callbacks.length; site++) {
    const make = factory ? vm.runInNewContext(`(varInfo,expectedType,validateType)=>{${factory};return createPromptValidator(varInfo,expectedType)}`) :
      vm.runInNewContext(`(varInfo,expectedType,validateType)=>(${callbacks[site]})`)
    for (const value of ['', 'hello', '0', '1', 'true', 'false', '{}', '[]', 'a,b', 'null']) {
      for (const expectedType of [null, 'String', 'Number', 'Boolean', 'Json', 'Object', 'Array']) {
        for (const required of [false, true]) for (const fallback of [false, true]) {
          for (const throwAt of ['', 'required', 'fallback', 'validator']) {
            const trace = []
            const varInfo = {
              get isRequired() { trace.push('required'); if (throwAt === 'required') throw new Error('required getter'); return required },
              get hasFallback() { trace.push('fallback'); if (throwAt === 'fallback') throw new Error('fallback getter'); return fallback },
            }
            const validateType = (...args) => { trace.push(['type', ...args]); if (throwAt === 'validator') throw new Error('validator'); return realValidator(...args) }
            const validate = make(varInfo, expectedType, validateType)
            assert.deepEqual(trace, [], 'factory must not validate eagerly')
            results.promptValidation.push({ site, value, expectedType, required, fallback, throwAt, result: await observe(() => validate(value), trace) })
          }
        }
      }
    }
  }
  const serialized = JSON.stringify(results)
  const before = path.join(__dirname, 'observations_before.json')
  if (mode === 'capture') fs.writeFileSync(before, serialized + '\n')
  else assert.equal(serialized, fs.readFileSync(before, 'utf8').trim(), 'before/after observations differ')
  console.log(JSON.stringify({ mode, rootCases: results.rootExecution.length, fileCases: results.fileExecution.length,
    validatorCases: results.promptValidation.length, equal: mode !== 'capture' }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
