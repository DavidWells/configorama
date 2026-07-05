/* confx settings fixture: registers a mock variable source
   Stands in for a real resolver like configorama/plugins/onepassword */
module.exports = {
  variableSources: [
    {
      type: 'mock',
      match: /^mock:/,
      resolver: async (varString) => `resolved-${varString.slice(5)}`,
    },
  ],
}
