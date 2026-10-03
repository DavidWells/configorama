const { ConfigoramaError } = require('../errors')
/** Detect active back edges iteratively; repeated acyclic aliases are valid.
 * @param {*} input @param {{ source?: string, maxDepth?: number, maxVisitedNodes?: number }} [options]
 */
module.exports = function validateStructure(input, options = {}) {
  const maxDepth = options.maxDepth || 512; const maxVisitedNodes = options.maxVisitedNodes || 1000000
  const active = new WeakMap(); let visited = 0
  const stack = [{ value: input, path: [], exit: false }]
  while (stack.length) {
    const frame = stack.pop(); const { value, path } = frame
    if (frame.exit) { active.delete(value); continue }
    require('./resolutionBudget').visit(path.length)
    if (++visited > maxVisitedNodes || path.length > maxDepth) throw new ConfigoramaError('resolution_limit', 'Configuration traversal limit exceeded', { path, source: options.source, limit: path.length > maxDepth ? 'maxDepth' : 'maxVisitedNodes' })
    if (!value || typeof value !== 'object') continue
    if (active.has(value)) throw new ConfigoramaError('circular_structure', 'Configuration contains a circular object structure', { path, ancestorPath: active.get(value), source: options.source })
    active.set(value, path); stack.push({ value, path, exit: true })
    for (const key of Object.keys(value).reverse()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor && 'value' in descriptor) stack.push({ value: descriptor.value, path: [...path, key], exit: false })
    }
  }
  return visited
}
