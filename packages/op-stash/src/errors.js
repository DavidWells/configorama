/* Error classes for op-stash callers.
   Keeps daemon, scope, and op execution failures distinguishable. */

class OpStashError extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
  }
}

class DaemonUnavailableError extends OpStashError {}
class OpExecError extends OpStashError {}
class ScopeError extends OpStashError {}
class ConfigError extends OpStashError {}
class ProtocolError extends OpStashError {}
class UsageError extends OpStashError {}

module.exports = {
  OpStashError,
  DaemonUnavailableError,
  OpExecError,
  ScopeError,
  ConfigError,
  ProtocolError,
  UsageError,
}
