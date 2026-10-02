const { ConfigoramaError } = require('../errors')
const DEFAULT_LIMITS = { maxPasses: 1000, maxDepth: 512, maxVisitedNodes: 1000000 }
function createBudget(settings = {}) {
  const limits = { ...DEFAULT_LIMITS, ...settings.resolutionLimits }
  for (const [name, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value < 1) throw new ConfigoramaError('resolution_limit', `Invalid resolution limit ${name}`, { limit: name })
  if (settings.timeoutMs !== undefined && (!Number.isFinite(settings.timeoutMs) || settings.timeoutMs <= 0)) throw new ConfigoramaError('resolution_timeout', 'timeoutMs must be a positive finite number')
  const deadline = settings._deadlineAt || (settings.timeoutMs ? Date.now() + settings.timeoutMs : undefined)
  let visited = 0; let passes = 0; let closed = false; let running = false
  const signal = settings.signal
  function check() {
    if (signal && signal.aborted) throw new ConfigoramaError('resolution_aborted', 'Configuration resolution was aborted')
    if (closed || (deadline !== undefined && Date.now() >= deadline)) throw new ConfigoramaError('resolution_timeout', 'Configuration resolution deadline exceeded')
  }
  const budget = {
    limits, deadline,
    check,
    visit(depth = 0) {
      check()
      if (++visited > limits.maxVisitedNodes || depth > limits.maxDepth) throw new ConfigoramaError('resolution_limit', 'Configuration resolution work limit exceeded', { limit: depth > limits.maxDepth ? 'maxDepth' : 'maxVisitedNodes' })
    },
    pass() { check(); if (++passes > limits.maxPasses) throw new ConfigoramaError('resolution_limit', 'Configuration resolution pass limit exceeded', { limit: 'maxPasses' }) },
    onClose: () => {},
    async run(fn) {
      check()
      if (running) return fn()
      running = true
      let timer; let abort
      const cancel = new Promise((_, reject) => {
        if (deadline !== undefined) timer = setTimeout(() => reject(new ConfigoramaError('resolution_timeout', 'Configuration resolution deadline exceeded')), Math.max(0, deadline - Date.now()))
        if (signal) { abort = () => reject(new ConfigoramaError('resolution_aborted', 'Configuration resolution was aborted')); signal.addEventListener('abort', abort, { once: true }) }
      })
      try { const value = await Promise.race([Promise.resolve().then(fn), cancel]); check(); return value }
      finally { closed = true; running = false; clearTimeout(timer); if (signal && abort) signal.removeEventListener('abort', abort); budget.onClose() }
    },
  }
  return budget
}
function currentBudget() { const context = require('./encoders/opaque').currentContext(); return context && context.budget }
function visit(depth = 0) { const budget = currentBudget(); if (budget) budget.visit(depth) }
module.exports = { DEFAULT_LIMITS, createBudget, currentBudget, visit }
