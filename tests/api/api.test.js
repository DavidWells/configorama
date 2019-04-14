/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import Configorama from '../../lib'

test.cb('API is asynchronous', (t) => {
  let order = [
    'one'
  ]
  const configFile = path.join(__dirname, 'api.yml')
  const configorama = new Configorama(configFile)

  configorama.init({
    stage: 'dev',
  }).then((c) => {
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(c).length)
    console.log(c)
    console.log(`-------------`)
    order.push('three')
    t.deepEqual(order, ['one', 'two', 'three'])
    t.end()
  })
  order.push('two')
})
