/* Settings file for setup tests: answers an option, proving options are not exported directly */
module.exports = {
  promptRenderer: async () => ({
    options: { stage: 'qa' },
    env: {
      SETUP_TEST_API_KEY: 'sk-test-secret-value',
      SETUP_TEST_REGION: 'us-west-2',
    },
  }),
}
