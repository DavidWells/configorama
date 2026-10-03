/* Public descriptors are immutable snapshots of the source contract, without execution state. */
const { cloneDeep } = require('./lodash')
module.exports = function publicVariableTypes(types) {
  return types.map(source => {
    const descriptor=cloneDeep(Object.fromEntries(Object.entries(source).filter(([, value]) => typeof value !== 'function')))
    if(descriptor.match instanceof RegExp)descriptor.match.lastIndex=0
    return descriptor
  })
}
