function quote(value) {
  return JSON.stringify(String(value))
}

function toMermaid(graph) {
  const lines = ['graph TD']
  for (const node of graph.nodes) {
    lines.push(`  ${sanitizeId(node.id)}[${quote(node.label || node.variable || node.relativePath || node.id).slice(1, -1)}]`)
  }
  for (const edge of graph.edges) {
    lines.push(`  ${sanitizeId(edge.from)} -->|${edge.kind}| ${sanitizeId(edge.to)}`)
  }
  return lines.join('\n') + '\n'
}

function sanitizeId(value) {
  return String(value).replace(/[^A-Za-z0-9_]/g, '_')
}

function toDot(graph) {
  const lines = ['digraph configorama {']
  for (const node of graph.nodes) {
    lines.push(`  ${quote(node.id)} [label=${quote(node.label || node.variable || node.relativePath || node.id)}];`)
  }
  for (const edge of graph.edges) {
    lines.push(`  ${quote(edge.from)} -> ${quote(edge.to)} [label=${quote(edge.kind)}];`)
  }
  lines.push('}')
  return lines.join('\n') + '\n'
}

function formatGraph(graph, format = 'json') {
  const normalized = String(format || 'json').toLowerCase()
  if (normalized === 'mermaid' || normalized === 'mmd') return toMermaid(graph)
  if (normalized === 'dot' || normalized === 'graphviz') return toDot(graph)
  return JSON.stringify(graph, null, 2)
}

module.exports = {
  formatGraph,
  toDot,
  toMermaid,
}
