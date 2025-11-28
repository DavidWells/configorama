/**
 * Wraps a parser/dumper function with error handling
 * @param {Function} fn - The function to wrap
 * @returns {Function} - Wrapped function with error handling
 */
function createSafeWrapper(fn) {
  return function(...args) {
    try {
      return fn(...args)
    } catch (e) {
      throw new Error(e)
    }
  }
}

/**
 * Creates a format converter that parses input and dumps to another format
 * @param {Function} parseFn - Function to parse the input content
 * @param {Function} dumpFn - Function to dump/stringify to target format
 * @returns {Function} - Converter function
 */
function createFormatConverter(parseFn, dumpFn) {
  return function(contents) {
    try {
      return dumpFn(parseFn(contents))
    } catch (e) {
      throw new Error(e)
    }
  }
}

module.exports = {
  createSafeWrapper,
  createFormatConverter
}
