/* configx settings fixture: a resolver with a real side effect (a sentinel
   file) standing in for the 1Password prompt, so tests can prove pre-flight
   never invokes it when a cheap variable fails first */
const fs = require('fs')

module.exports = {
  variableSources: [
    {
      type: 'sidefx',
      match: /^sidefx:/,
      resolver: async () => {
        const sentinel = process.env.CONFIGX_SENTINEL
        if (sentinel) fs.writeFileSync(sentinel, 'resolver-ran')
        return 'secret-value'
      },
    },
  ],
}
