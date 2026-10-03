const path = require('node:path')
const fs = require('node:fs')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const processGraph = { modules: new Map(), records: Object.create(null) }
/** Separate config-owned module evaluation from function invocation. Global
 * require.cache entries and application exports are never deleted or modified.
 * @param {string} filePath @param {Object} [context] @param {'legacy'|'process'|'load'} [mode]
 * @returns {*}
 */
module.exports = function loadExecutable(filePath, context, mode = 'legacy') {
  const file = fs.realpathSync(path.resolve(filePath))
  if (!['legacy', 'process', 'load'].includes(mode)) throw new Error('moduleCacheMode must be legacy, process or load')
  if (mode === 'legacy') {
    if (/\.(ts|tsx|mts|cts)$/.test(file)) return require('../parsers/typescript').executeTypeScriptFileSync(file)
    if (/\.(mjs|esm)$/.test(file)) return require('../parsers/esm').executeESMFileSync(file)
    return require(file)
  }
  const graph = mode === 'process' ? processGraph : context
  if (!graph.records) graph.records = Object.create(null)
  function interop(exports) {
    if (!exports || !exports.__esModule || !Object.prototype.hasOwnProperty.call(exports, 'default')) return exports
    const value = exports.default
    if (!value || !['object','function'].includes(typeof value)) return value
    return new Proxy(value, { get(target, key, receiver) {
      if (Object.prototype.hasOwnProperty.call(exports, key)) return exports[key]
      return Reflect.get(target, key, receiver)
    } })
  }
  function evaluate(filename) {
    const file = fs.realpathSync(filename)
    if (graph.modules.has(file)) return graph.modules.get(file)
    if (graph.records[file]) return interop(graph.records[file].exports) // CJS dependency cycle
    const native = createRequire(file)
    const record = { id: file, filename: file, exports: {}, loaded: false, children: [], paths: native.resolve.paths(file) || [] }
    graph.records[file] = record
    const ownedRequire = Object.assign(function ownedRequire(specifier) {
      const resolved = native.resolve(specifier)
      // Relative/absolute imports are owned, including symlinks and outside-root
      // helpers. Bare packages and Node builtins retain their native lifecycle.
      if ((specifier.startsWith('.') || path.isAbsolute(specifier)) && /\.(?:[cm]?jsx?|[cm]?tsx?|json|esm)$/.test(resolved)) return evaluate(resolved)
      return native(specifier)
    }, { resolve: native.resolve, cache: graph.records, main: require.main, extensions: require.extensions })
    const source = fs.readFileSync(file, 'utf8')
    try {
      if (file.endsWith('.json')) record.exports = JSON.parse(source)
      else {
        const { createJiti } = require('jiti')
        const loader = createJiti(file, { interopDefault: false, fsCache: false, moduleCache: false, tryNative: false })
        const transformed = loader.transform({ source, filename: file, ts: /\.[cm]?tsx?$/.test(file), jsx: /\.[jt]sx$/.test(file) })
        const run = vm.compileFunction(transformed, ['exports','require','module','__filename','__dirname','jitiImport','jitiESMResolve'], { filename: file })
        run.call(record.exports, record.exports, ownedRequire, record, file, path.dirname(file), specifier => Promise.resolve(ownedRequire(specifier)), specifier => pathToFileURL(native.resolve(specifier)).href)
      }
      record.loaded = true
      const value = interop(record.exports); graph.modules.set(file, value); return value
    } catch (error) {
      delete graph.records[file]; graph.modules.delete(file)
      throw error
    }
  }
  return evaluate(file)
}
