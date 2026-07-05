/**
 * Test file: Accepts object as first argument
 * Used to test passing JSON objects to file() references
 */
module.exports = function(objArg, ctx) {
  return {
    received: objArg,
    type: typeof objArg,
    isObject: typeof objArg === 'object' && objArg !== null
  }
}
