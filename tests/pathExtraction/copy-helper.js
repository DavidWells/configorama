const fs = require('fs')

const outputFile = process.argv[2]
let input = ''

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  input += chunk
})
process.stdin.on('end', () => {
  fs.writeFileSync(outputFile, input)
})
