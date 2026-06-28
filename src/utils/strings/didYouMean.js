// Suggests the closest known string to a possibly-misspelled input.
// Used for command and flag "did you mean ...?" hints in the CLI.

/**
 * Optimal string alignment (Damerau) edit distance between two strings.
 * Counts an adjacent transposition (e.g. "fromat" -> "format") as one edit,
 * which keeps real single typos close while keeping unrelated words far apart.
 * @param {string} a
 * @param {string} b
 * @returns {number} minimum edits (insert/delete/substitute/transpose)
 */
function editDistance(a, b) {
  a = String(a)
  b = String(b)
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m

  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) d[i][0] = i
  for (let j = 0; j <= n; j++) d[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(
        d[i - 1][j] + 1,        // deletion
        d[i][j - 1] + 1,        // insertion
        d[i - 1][j - 1] + cost  // substitution
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1) // transposition
      }
    }
  }

  return d[m][n]
}

/**
 * Returns the candidate closest to input within an edit-distance threshold.
 * Defaults to threshold 1 so only near-certain typos are suggested; this avoids
 * hijacking legitimate passthrough options (e.g. `--stage`) that happen to sit a
 * couple of edits away from a known flag.
 * @param {string} input - the user-provided (possibly misspelled) token
 * @param {string[]} candidates - known valid strings
 * @param {{ threshold?: number }} [options]
 * @returns {string|null} closest candidate, or null if none is close enough
 */
function didYouMean(input, candidates, options = {}) {
  const threshold = options.threshold === undefined ? 1 : options.threshold
  const value = String(input)
  let best = null
  let bestDist = Infinity

  for (const candidate of candidates) {
    const dist = editDistance(value, candidate)
    if (dist < bestDist) {
      bestDist = dist
      best = candidate
    }
  }

  if (best === null || bestDist > threshold) return null
  return best
}

module.exports = { editDistance, didYouMean }
