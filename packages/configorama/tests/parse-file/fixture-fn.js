// JS config file that exports a function
module.exports = function(args) {
  return {
    name: 'js-fn-config',
    stage: args.stage || 'default'
  }
}
