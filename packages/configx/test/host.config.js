/* configx settings fixture: a resolver that echoes CONFIGORAMA_PROGRAM_NAME
   so tests can prove configx sets it during resolution */
module.exports = {
  variableSources: [
    {
      type: 'host',
      match: /^host:/,
      resolver: async () => process.env.CONFIGORAMA_PROGRAM_NAME || 'unset',
    },
  ],
}
