/* Settings file for setup tests: canned prompt answers instead of interactive prompts */
module.exports = {
  promptRenderer: async () => ({
    env: {
      SETUP_TEST_API_KEY: 'sk-test-secret-value',
      SETUP_TEST_REGION: 'us-west-2',
    },
  }),
}
