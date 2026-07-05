/* Mock plugin factory for sync bridge tests
   Returns a variable source with resolver + metadata like a real plugin */

/**
 * @param {object} options - JSON-round-tripped syncOptions
 * @returns {object} Variable source
 */
module.exports = function createMockSource(options = {}) {
  const collected = []
  return {
    type: 'mock',
    match: /^mock:/,
    resolver: async (varString, opts, currentObject, valueObject) => {
      collected.push({
        raw: valueObject.originalSource,
        varString,
        receivedOptions: options,
      })
      return `resolved-${varString.slice(5)}${options.suffix || ''}`
    },
    metadataKey: 'mockReferences',
    collectMetadata: () => collected,
  }
}
