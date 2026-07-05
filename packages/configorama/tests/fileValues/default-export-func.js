/**
 * Test file: Default export function with nested return value
 * Used to test deep property access on default export functions
 * e.g., ${file(./default-export-func.js):database.host}
 */
module.exports = function() {
  return {
    database: {
      host: 'localhost',
      port: 5432,
      credentials: {
        user: 'admin',
        password: 'secret123'
      }
    },
    features: {
      enabled: true,
      flags: ['flag1', 'flag2', 'flag3']
    }
  }
}
