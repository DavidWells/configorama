const _ = require('lodash')

// Track promise resolution
class PromiseTracker {
  constructor() {
    this.reset()
  }
  reset() {
    this.promiseList = []
    this.promiseMap = {}
    this.startTime = Date.now()
    this.cursor = 0
  }
  start() {
    this.reset()
    this.interval = setInterval(this.report.bind(this), 2500)
  }
  report() {
    const delta = Date.now() - this.startTime
    const pending = this.getPending()
    const dots = dotdotdot(this.cursor++, 100, '...')
    console.log([
      `Fetching Async values${dots}`,
    ].concat(
      pending.map((promise) => `- ${promise.waitList}`)
    ).join('\n  '))
    /*
    console.log([
      '##########################################################################################',
      `# ${delta}: ${this.getSettled().length} of ${this.getAll().length} promises have settled`,
      `# ${delta}: ${pending.length} unsettled promises:`,
    ].concat(
      pending.map((promise) => `# ${delta}:   ${promise.waitList}`)
    ).concat([
      '# This can result from latent connections but may represent a cyclic variable dependency',
      '##########################################################################################',
    ]).join('\n  '))
    /**/
  }
  stop() {
    clearInterval(this.interval)
    this.reset()
  }
  add(variable, prms, specifier, hasFilter) {
    const promise = prms
    // Refactor promise tracker to account for multiple instances of a given variable

    // console.log(`${specifier} hasFilter`, hasFilter)
  
    // If a filter is used, the promise needed a unique resolution ID
    let uniqueId = ''
    if (hasFilter) {
      uniqueId = hasFilter.reduce((acc, currentFilter, i) => {
        acc += `|${_.trim(currentFilter)}`
        return acc
      }, '')
    }

    const nameSpacedVariable = `${variable}${uniqueId}`
    console.log('nameSpacedVariable', nameSpacedVariable)

    promise.waitList = `${variable} waited on by: ${specifier} ${nameSpacedVariable}`
    promise.state = 'pending'
    promise.then( // creates a promise with the following effects but that we otherwise ignore
      () => { promise.state = 'resolved' },
      () => { promise.state = 'rejected' })

    this.promiseList.push(promise)

    this.promiseMap[`${nameSpacedVariable}`] = promise
    return promise
  }
  contains(variable) {
    return variable in this.promiseMap
  }
  get(variable, specifier) {
    const promise = this.promiseMap[variable]
    promise.waitList += ` ${specifier}`
    return promise
  }
  getPending() {
    return this.promiseList.filter(p => (p.state === 'pending'))
  }
  getSettled() {
    return this.promiseList.filter(p => (p.state !== 'pending'))
  }
  getAll() {
    return this.promiseList
  }
}

function dotdotdot(cursor, times, string) {
  return Array(times - Math.abs(cursor % (times * 2) - times) + 1).join(string)
}

module.exports = PromiseTracker
