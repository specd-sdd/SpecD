import { SpecdGuideError } from './specd-guide-error.js'

/**
 * Thrown when a requested guide topic identifier cannot be found in the catalog.
 *
 * The message reports the failed lookup and, when the catalog can answer it, the one
 * identifier that fixes the request. It deliberately does not enumerate the catalog: with
 * more than a thousand generated topics, a quoted window of names is dominated by
 * alphabetically early entries that share nothing with the request, so it costs tokens
 * without informing the caller. The complete candidate list stays available to structured
 * callers under `metadata.availableTopics`, and the message instead names the command that
 * browses the catalog.
 */
export class GuideTopicNotFoundError extends SpecdGuideError {
  private readonly _topic: string
  private readonly _availableTopics: readonly string[]
  private readonly _titleMatches: readonly string[]
  private readonly _crossCollection: boolean

  /**
   * Machine-readable error code.
   *
   * @returns 'UNKNOWN_GUIDE_TOPIC'
   */
  override get code(): string {
    return 'UNKNOWN_GUIDE_TOPIC'
  }

  /**
   * The topic identifier exactly as supplied by the caller, before any normalization.
   *
   * @returns The requested topic
   */
  get topic(): string {
    return this._topic
  }

  /**
   * Collection-qualified identifiers of topics whose title equals the requested topic.
   *
   * Generated API topics keep their symbol name in the topic path, so a caller who pastes
   * a symbol name such as `FreshnessLatches` does not produce a topic identifier. When the
   * catalog holds a topic titled exactly like the request, these entries are the canonical
   * addresses for it. Empty when no title matched anywhere in the catalog.
   *
   * @returns Title-matched topic identifiers
   */
  get titleMatches(): readonly string[] {
    return this._titleMatches
  }

  /**
   * Whether the title matched only outside the collection the request named.
   *
   * A request qualified with the wrong collection is the most common cause of an unknown
   * generated topic, because the same class name can be exported by more than one package.
   * Reporting the collection the caller named as if it were the only possibility hides the
   * actual fix, so this distinguishes "the title exists here" from "the title exists
   * elsewhere".
   *
   * @returns `true` when the caller named a collection and every title match is in another
   */
  get crossCollection(): boolean {
    return this._crossCollection
  }

  /**
   * The collection-qualified topic identifiers registered in the collection that was searched.
   *
   * Every entry is a `collection:topic` identifier, so a caller can pass a reported
   * value straight back into the topic lookup without transforming it.
   *
   * @returns Available topics
   */
  get availableTopics(): readonly string[] {
    return this._availableTopics
  }

  /**
   * Creates a new GuideTopicNotFoundError.
   *
   * @param topic - The topic identifier exactly as supplied by the caller.
   * @param availableTopics - Collection-qualified identifiers registered in the searched collection.
   * @param titleMatches - Identifiers of topics whose title equals the request, from any collection.
   * @param crossCollection - Whether every title match lies outside the requested collection.
   */
  constructor(
    topic: string,
    availableTopics: readonly string[] = [],
    titleMatches: readonly string[] = [],
    crossCollection = false,
  ) {
    const suggestion =
      titleMatches.length === 0
        ? ''
        : crossCollection
          ? ` That title exists in another collection: ${titleMatches.join(', ')}.`
          : ` A topic titled '${topic}' exists: ${titleMatches.join(', ')}.`
    const headline =
      topic.trim().length === 0
        ? `Guide topic cannot be empty.`
        : `Guide topic '${topic}' not found.`
    super(`${headline}${suggestion}`)
    this._topic = topic
    this._availableTopics = availableTopics
    this._titleMatches = titleMatches
    this._crossCollection = crossCollection
  }
}
