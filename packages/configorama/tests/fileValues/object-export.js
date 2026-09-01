// Test fixture: a JS file that exports a plain object directly (not a function).
// Used to verify ${file(./object-export.js)} and property access work like a function export.
module.exports = {
  name: 'object-export',
  nested: { deep: 'nval', num: 42 },
  list: ['a', 'b', 'c'],
  enabled: true,
}
