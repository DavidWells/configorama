const readline = require('readline')

function handleSignalEvents() {
  if (global.signalEventHandling) return   // Only set up handlers once
  // NOTE: instantiating this global variable here to keep track of the state
  // usually global variables should be "considered harmful" but are a good fit in this case
  global.signalEventHandling = {
    SIGINTCount: 0,
    shouldExitGracefully: false
  }

  const msg = `
───────────────────────────────────────────────────────────
Exit received. Waiting for current operation to finish...
───────────────────────────────────────────────────────────
`

  if (process.platform === 'win32') {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    // Clean up readline interface when done
    process.once('exit', () => rl.close())
    
    rl.on('SIGINT', () => process.emit('SIGINT'))
    rl.on('SIGTERM', () => process.emit('SIGTERM'))
    rl.on('SIGBREAK', () => process.emit('SIGBREAK'))
  }

  process.on('SIGINT', () => {
    global.signalEventHandling.SIGINTCount += 1
    global.signalEventHandling.shouldExitGracefully = true
    if (global.signalEventHandling.SIGINTCount < 2) {
      console.log(`${msg} Press CTRL + C again to force an exit\nNOTE: Doing so might corrupt the applications state information!`)
    } else {
      process.exit(1)
    }
  })

  process.on('SIGTERM', () => {
    global.signalEventHandling.shouldExitGracefully = true
    console.log(msg)
  })

  process.on('SIGBREAK', () => {
    global.signalEventHandling.shouldExitGracefully = true
    console.log(msg)
  })
}

/*
if (global.signalEventHandling && global.signalEventHandling.shouldExitGracefully) {
  throw new Error('Operation gracefully exited. State successfully persisted...')
}
*/

module.exports = handleSignalEvents
