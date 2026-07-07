/* Error classes for op-cache callers.
   Keeps daemon, scope, and op execution failures distinguishable. */

class OpCacheError extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
  }
}

class DaemonUnavailableError extends OpCacheError {}
class OpExecError extends OpCacheError {}
class ScopeError extends OpCacheError {}
class ConfigError extends OpCacheError {}
class ProtocolError extends OpCacheError {}
class UsageError extends OpCacheError {}

module.exports = {
  OpCacheError,
  DaemonUnavailableError,
  OpExecError,
  ScopeError,
  ConfigError,
  ProtocolError,
  UsageError,
}
