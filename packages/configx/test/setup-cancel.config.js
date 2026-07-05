/* Settings file for setup tests: simulates the user cancelling the wizard */
module.exports = {
  promptRenderer: async () => {
    throw new Error('Setup cancelled')
  },
}
