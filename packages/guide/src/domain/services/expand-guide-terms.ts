/**
 * Splits guide text into lowercase search terms, expanding code-shaped identifiers into
 * their constituent words.
 *
 * Neither BM25 nor the default tokenizer splits `camelCase`, `PascalCase`, or acronym
 * runs, so a document titled `FreshnessLatches` would only ever be reachable through the
 * literal token `freshnesslatches`. For every alphanumeric run this emits the run itself
 * in lowercase *and* its words, so all of these reach that document:
 *
 * - `FreshnessLatches` — the joined form matches, and so do the words
 * - `freshnesslatches` — a caller who lowercased the name still matches the joined form
 * - `freshness latches` — prose that names the symbol in words
 *
 * The joined form is what keeps a lowercased query working; without it the query would
 * tokenize to a single term that no split indexed term could satisfy. Emitting both sides
 * also matches how the code graph expands identifiers before indexing and querying.
 *
 * The same function tokenizes the indexed text and the query, so both sides always agree
 * on the term vocabulary.
 *
 * @param text - Raw text to tokenize
 * @returns Lowercase alphanumeric terms in source order, without duplicates
 *
 * @example
 * expandGuideTerms('FreshnessLatches')       // ['freshnesslatches', 'freshness', 'latches']
 * expandGuideTerms('code-graph:HTTP2Adapter') // ['code', 'graph', 'http2adapter', 'http', '2', 'adapter']
 */
export function expandGuideTerms(text: string): string[] {
  const terms: string[] = []

  for (const run of text.split(/[^a-zA-Z0-9]+/)) {
    if (run.length === 0) {
      continue
    }

    const joined = run.toLowerCase()
    terms.push(joined)
    for (const word of splitIdentifier(run)) {
      terms.push(word)
    }
  }

  return dedupeStable(terms)
}

/**
 * Splits one identifier into its lowercase words.
 *
 * @param run - A single alphanumeric run taken from the input text
 * @returns The run's words, in source order
 */
function splitIdentifier(run: string): string[] {
  const spaced = run
    // lowercase or digit followed by uppercase: handleError → handle Error
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // acronym run followed by a capitalized word: XMLParser → XML Parser
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    // letter/digit boundaries: http2 → http 2
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')

  return spaced
    .split(/[^a-zA-Z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase())
}

/**
 * Removes duplicate terms while preserving their first-seen order.
 *
 * @param terms - Terms to deduplicate
 * @returns The same terms without duplicates
 */
function dedupeStable(terms: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const term of terms) {
    if (seen.has(term)) {
      continue
    }
    seen.add(term)
    result.push(term)
  }
  return result
}
