/* Per-connection robustness: clients that hang up early must not crash the
   daemon, and each connection serves exactly one request. */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const net = require('net')
const path = require('path')
const { startDaemon } = require('../src/daemon')
const { request } = require('../src/client')
const { encode } = require('../src/protocol')
const { tempDir } = require('./helpers')

function daemonConfig(dir) {
  return {
    socket_path: path.join(dir, 'sock.sock'),
    ttl_seconds: 60,
    max_ttl_seconds: 60,
    max_entries: 10,
    idle_exit_seconds: 30,
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('socket is created 0600', async () => {
  const config = daemonConfig(tempDir())
  const { server } = await startDaemon(config)
  try {
    assert.is(fs.statSync(config.socket_path).mode & 0o777, 0o600)
  } finally {
    server.close()
  }
})

test('client hanging up before the reply does not crash the daemon', async () => {
  const config = daemonConfig(tempDir())
  const { server } = await startDaemon(config)
  try {
    await request(config, { type: 'set', key: 'k', scope: 'user', value: 'v', ttlSeconds: 60 })
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => {
        const socket = net.createConnection(config.socket_path, () => {
          socket.write(encode({ type: 'get', key: 'k', scope: 'user' }))
          socket.destroy()
          resolve()
        })
        socket.on('error', resolve)
      })
    }
    await sleep(100)
    // An unhandled EPIPE/ECONNRESET would have thrown in this process
    const got = await request(config, { type: 'get', key: 'k', scope: 'user' })
    assert.equal(got, { type: 'hit', value: 'v' })
  } finally {
    server.close()
  }
})

test('a connection handles only its first message', async () => {
  const config = daemonConfig(tempDir())
  const { server } = await startDaemon(config)
  try {
    await request(config, { type: 'set', key: 'k', scope: 'user', value: 'v', ttlSeconds: 60 })
    await new Promise((resolve, reject) => {
      const socket = net.createConnection(config.socket_path, async () => {
        socket.write(encode({ type: 'get', key: 'k', scope: 'user' }))
        await sleep(30)
        // A later chunk on the same connection must not re-run the get
        socket.write(encode({ type: 'get', key: 'k', scope: 'user' }))
        await sleep(30)
        socket.end()
      })
      socket.on('error', () => {})
      socket.on('close', resolve)
      socket.on('timeout', reject)
      socket.resume()
    })
    const stats = await request(config, { type: 'stats' })
    assert.is(stats.hits, 1)
  } finally {
    server.close()
  }
})

test.run()
