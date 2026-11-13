import { GuideTopicNotFoundError } from '../../domain/errors/guide-topic-not-found-error.js'
import type { GuideTopic } from '../../domain/models/guide-topic.js'
import { normalizeTopicRef, qualifyTopic } from '../../domain/topic-identity.js'
import type { GuideCatalogPort } from '../ports/guide-catalog-port.js'

/**
 * Input parameters for retrieving a guide document.
 */
export interface GetGuideInput {
  /** The raw or collection-qualified guide topic identifier. */
  readonly topic: string
}

/**
 * Query handler for retrieving a single complete guide document by topic.
 */
export class GetGuideQuery {
  private readonly catalog: GuideCatalogPort

  /**
   * Creates a new GetGuideQuery.
   *
   * @param catalog - The catalog port supplying guide topics.
   */
  constructor(catalog: GuideCatalogPort) {
    this.catalog = catalog
  }

  /**
   * Retrieves a complete guide document.
   *
   * The input is normalized by trimming whitespace, stripping a trailing `.md`
   * extension, and lowercasing, in that order, before resolution.
   *
   * When normalization finds no topic, a topic whose title equals the request is reported
   * as the suggestion rather than being resolved, so a caller who mistyped a symbol name
   * or pasted a title is corrected instead of silently redirected.
   *
   * The title search first covers the collection the request named. A request qualified with
   * the wrong collection is the most common cause of a miss here, because the same class name
   * can be exported by more than one package, so when the scoped search finds nothing the
   * whole catalog is searched and the match is reported as belonging to another collection.
   * The suggestion is never resolved, so a caller that names one collection still decides
   * for itself whether to read the other.
   *
   * @param input - Contains the topic identifier.
   * @returns The matching guide document.
   * @throws {GuideTopicNotFoundError} If no topic matches after normalization.
   */
  async execute(input: GetGuideInput): Promise<GuideTopic> {
    const topic = input.topic
    const ref = normalizeTopicRef(topic)

    if (ref.topic.length === 0) {
      throw new GuideTopicNotFoundError(topic, [])
    }

    const collections = await this.catalog.getCollections()
    const collection = ref.collection ?? (collections.length === 1 ? collections[0] : undefined)
    const match =
      collection === undefined
        ? null
        : await this.catalog.getGuide(qualifyTopic(collection, ref.topic))

    if (match === null) {
      const available = await this.catalog.getAllTopics()
      const scoped =
        ref.collection === undefined
          ? available
          : available.filter((t) => t.collection === ref.collection)
      const scopedTitleMatches = findByTitle(scoped, ref.topic)
      const crossCollection = ref.collection !== undefined && scopedTitleMatches.length === 0
      const titleMatches = crossCollection ? findByTitle(available, ref.topic) : scopedTitleMatches
      const suggested = new Set(titleMatches)
      const rest = scoped
        .map((t) => qualifyTopic(t.collection, t.topic))
        .filter((qualified) => !suggested.has(qualified))
        .sort((a, b) => compareBySimilarity(a, b, ref.collection, ref.topic))
      const availableTopics = crossCollection ? rest : [...titleMatches, ...rest]
      throw new GuideTopicNotFoundError(
        topic,
        availableTopics,
        titleMatches,
        crossCollection && titleMatches.length > 0,
      )
    }

    return match
  }
}

/**
 * Finds topics whose title equals the symbol named in the request, ignoring case.
 *
 * A generated API topic keeps its symbol name in the topic path, so a caller who knows a
 * symbol as `FreshnessLatches` has no topic identifier to type. Hand-written topics have
 * the same gap in reverse: their title is prose while their topic is a slug. Matching on
 * the title lets either mistake resolve to the canonical address instead of an error.
 *
 * The comparison uses the last segment of the requested topic, so a request that keeps the
 * kind directory still matches: `code-graph:classes/FreshnessLatches` names the symbol
 * `FreshnessLatches`, and comparing the whole path against the title would reject it. The
 * directory is deliberately ignored rather than matched, because the caller who gets the
 * collection wrong usually gets the directory wrong the same way, and both are corrected by
 * the same suggestion.
 *
 * Titles are compared verbatim after lowercasing, so a suggestion is only offered when it
 * is unambiguous about what was meant. Results are sorted so the suggestion is stable
 * across runs.
 *
 * @param topics - Candidate topics from the searched collection.
 * @param topic - Normalized topic identifier from the request.
 * @returns Collection-qualified identifiers of topics titled like the request.
 */
function findByTitle(topics: readonly GuideTopic[], topic: string): string[] {
  const target = lastSegment(topic).toLowerCase()
  return topics
    .filter((t) => t.title.toLowerCase() === target)
    .map((t) => qualifyTopic(t.collection, t.topic))
    .sort((a, b) => a.localeCompare(b))
}

/**
 * Returns the symbol named by a topic identifier, discarding its kind directory.
 *
 * `classes/BulkSessionStateError` and `BulkSessionStateError` name the same symbol, so a
 * caller who knows either form is asking the same question. Title matching and candidate
 * ranking both compare against this segment, because a directory prefix is part of the
 * address rather than part of what was asked for.
 *
 * @param topic - Normalized topic identifier.
 * @returns The final path segment.
 */
function lastSegment(topic: string): string {
  const segments = topic.split('/')
  return segments[segments.length - 1] ?? topic
}

/**
 * Orders two candidate identifiers by how closely they resemble the requested reference.
 *
 * The candidates are no longer printed, but `availableTopics` still ships to structured
 * callers, and leading it with the most plausible entries means a caller that does want to
 * enumerate does not have to re-sort the list itself. Ranking by shared prefix surfaces the
 * topics a caller most likely meant — a request for `prot` reports `ports` first — instead
 * of the catalog's first page.
 *
 * @param a - Left candidate identifier.
 * @param b - Right candidate identifier.
 * @param collection - Collection from the requested reference, if any.
 * @param topic - Normalized topic from the requested reference.
 * @returns Negative when `a` is more similar, positive when `b` is, otherwise 0.
 */
function compareBySimilarity(
  a: string,
  b: string,
  collection: string | undefined,
  topic: string,
): number {
  return relevance(b, collection, topic) - relevance(a, collection, topic)
}

/**
 * Scores how closely a candidate identifier resembles the requested reference.
 *
 * Candidates outside the requested collection score zero, so a qualified request never
 * surfaces another collection's topics ahead of the ones the caller can actually read.
 *
 * A request carrying a kind directory is compared by symbol, because `classes/Foo` and
 * `Foo` ask the same thing. A request without one is compared by full topic path, so
 * `ports` outranks `interfaces/ProtocolX` for a request of `prot`: both share four
 * characters by symbol, but only one shares them by path.
 *
 * @param candidate - Candidate `collection:topic` identifier.
 * @param collection - Collection from the requested reference, if any.
 * @param topic - Normalized topic from the requested reference.
 * @returns A score where a larger value means a closer match.
 */
function relevance(candidate: string, collection: string | undefined, topic: string): number {
  const lower = candidate.toLowerCase()

  let path = lower
  if (collection !== undefined) {
    const prefix = `${collection}:`
    if (!lower.startsWith(prefix)) {
      return 0
    }
    path = lower.slice(prefix.length)
  }

  const bySymbol = topic.includes('/')
  const target = bySymbol ? lastSegment(topic).toLowerCase() : topic
  const bare = bySymbol ? lastSegment(path).toLowerCase() : path

  if (bare === target) {
    return Number.MAX_SAFE_INTEGER
  }

  let shared = 0
  while (shared < bare.length && shared < target.length && bare[shared] === target[shared]) {
    shared++
  }

  // A candidate that extends the requested prefix outranks one that merely shares part
  // of it, so `ports` beats `profile` for a request of `prot`.
  return shared === target.length ? shared + 0.5 : shared
}
