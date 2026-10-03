const fs = require('fs')
const path = require('path')
const cp = require('child_process')
const ts = require('typescript')
const root = path.resolve(__dirname, '../../..')
const names = cp.execFileSync('rg', ['--files', 'src'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(f => f.endsWith('.js') && !/\.(?:slow-)?test\.js$/.test(f)).sort()
const files = {}, functions = []
const isFunction = n => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n)
for (const file of names) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const imports = new Set()
  function walk(n) {
    if (ts.isCallExpression(n) && n.expression.getText(source) === 'require' && n.arguments.length === 1 && ts.isStringLiteral(n.arguments[0])) imports.add(n.arguments[0].text)
    if (isFunction(n) && n.body) {
      let complexity = 1
      function count(c) {
        if (isFunction(c)) return
        if (ts.isIfStatement(c) || ts.isCaseClause(c) || ts.isCatchClause(c) || ts.isConditionalExpression(c) || ts.isForStatement(c) || ts.isForInStatement(c) || ts.isForOfStatement(c) || ts.isWhileStatement(c) || ts.isDoStatement(c)) complexity++
        if (ts.isBinaryExpression(c) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(c.operatorToken.kind)) complexity++
        ts.forEachChild(c, count)
      }
      count(n.body)
      const name = n.name ? n.name.getText(source) : n.parent && (ts.isVariableDeclaration(n.parent) || ts.isPropertyAssignment(n.parent)) ? n.parent.name.getText(source) : '<anonymous>'
      functions.push({ file, name, line: source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1, complexity })
    }
    ts.forEachChild(n, walk)
  }
  walk(source)
  files[file] = { physicalLines: source.text.split('\n').length - (source.text.endsWith('\n') ? 1 : 0), imports: [...imports].sort(), importsOut: imports.size, importsIn: 0 }
}
for (const [file, info] of Object.entries(files)) for (const target of info.imports) {
  if (!target.startsWith('.')) continue
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target))
  const match = [resolved, resolved + '.js', resolved + '/index.js'].find(f => files[f])
  if (match) files[match].importsIn++
}
const summary = { modules: names.length, functions: functions.length, complexityTotal: functions.reduce((n, f) => n + f.complexity, 0), importsOutTotal: Object.values(files).reduce((n, f) => n + f.importsOut, 0), internalEdges: Object.values(files).reduce((n, f) => n + f.importsIn, 0) }
summary.complexityMean = summary.complexityTotal / summary.functions
process.stdout.write(JSON.stringify({ commit: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), definition: 'TypeScript AST cyclomatic: 1 plus branches, loops, catches, conditional expressions and &&/||/??; excludes nested function bodies. Coupling: unique literal require targets per module.', files, functions, summary }, null, 2) + '\n')
