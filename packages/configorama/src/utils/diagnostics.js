/**
 * Per-load diagnostic policy. Dependency output is suppressed at the dependency;
 * this adapter never replaces global console methods or includes secret values.
 * @param {{ dotEnvSilent?: boolean, dotEnvDebug?: boolean }} settings
 */
module.exports = function diagnostics(settings) {
  return {
    info(message) { if (settings.dotEnvSilent === false) console.error(`configorama: ${message}`) },
    debug(message) { if (settings.dotEnvDebug === true) console.error(`configorama: ${message}`) },
  }
}
