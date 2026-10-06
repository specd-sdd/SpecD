import { SpecdGuideError } from './errors/specd-guide-error.js'
import type { GuideCollection } from './models/guide-topic.js'

/**
 * Thrown when a collection or topic identifier contains the reserved `:` delimiter.
 */
export class InvalidTopicIdentifierError extends SpecdGuideError {
  /**
   * Machine-readable error code.
   *
   * @returns 'INVALID_GUIDE_TOPIC'
   */
  override get code(): string {
    return 'INVALID_GUIDE_TOPIC'
  }

  /**
   * Creates a new InvalidTopicIdentifierError.
   *
   * @param message - Human-readable error description
   */
  constructor(message: string) {
    super(message)
  }
}

/**
 * Character reserved as the collection delimiter in a collection-qualified topic identifier.
 */
const COLLECTION_DELIMITER = ':'

/**
 * Parsed form of a collection-qualified topic reference.
 */
export interface ParsedTopicRef {
  /** The collection the topic belongs to, when the reference was qualified. */
  readonly collection: GuideCollection | undefined
  /** The topic identifier within its collection. */
  readonly topic: string
}

/**
 * Returns whether a collection or topic identifier is safe to use, i.e. contains no
 * reserved collection delimiter.
 *
 * @param value - Identifier to inspect.
 * @returns True when the value contains no ':' character.
 */
export function isValidCollectionId(value: string): boolean {
  return !value.includes(COLLECTION_DELIMITER)
}

/**
 * Normalizes a raw topic reference supplied by a caller.
 *
 * Normalization consists of, in order: trimming surrounding whitespace, stripping a
 * trailing `.md` extension, and lowercasing. No other transformation is applied, so
 * the `/` separator of a nested topic is preserved.
 *
 * @param raw - Raw topic reference as supplied by the caller.
 * @returns The normalized collection and topic.
 */
export function normalizeTopicRef(raw: string): ParsedTopicRef {
  const trimmed = raw.trim()
  const withoutExtension = trimmed.endsWith('.md') ? trimmed.slice(0, -3) : trimmed
  const lowered = withoutExtension.toLowerCase()

  const delimiterIdx = lowered.indexOf(COLLECTION_DELIMITER)
  if (delimiterIdx === -1) {
    return { collection: undefined, topic: lowered }
  }

  return {
    collection: lowered.slice(0, delimiterIdx),
    topic: lowered.slice(delimiterIdx + 1),
  }
}

/**
 * Builds the canonical collection-qualified identifier for a topic.
 *
 * @param collection - Collection the topic belongs to.
 * @param topic - Topic identifier within the collection.
 * @returns The `collection:topic` composite identifier.
 * @throws {SpecdGuideError} If either identifier contains the reserved delimiter.
 */
export function qualifyTopic(collection: GuideCollection, topic: string): string {
  if (!isValidCollectionId(collection)) {
    throw new InvalidTopicIdentifierError(
      `Collection identifier '${collection}' must not contain the reserved '${COLLECTION_DELIMITER}' delimiter`,
    )
  }
  if (topic.includes(COLLECTION_DELIMITER)) {
    throw new InvalidTopicIdentifierError(
      `Topic identifier '${topic}' must not contain the reserved '${COLLECTION_DELIMITER}' delimiter`,
    )
  }
  return `${collection}${COLLECTION_DELIMITER}${topic}`
}

/**
 * Extracts the collection and topic segments of a collection-qualified identifier.
 *
 * @param qualified - The `collection:topic` composite identifier.
 * @returns The parsed reference.
 */
export function splitQualifiedTopic(qualified: string): ParsedTopicRef {
  const delimiterIdx = qualified.indexOf(COLLECTION_DELIMITER)
  if (delimiterIdx === -1) {
    return { collection: undefined, topic: qualified }
  }
  return {
    collection: qualified.slice(0, delimiterIdx),
    topic: qualified.slice(delimiterIdx + 1),
  }
}

/**
 * Directory segments used by generated API topics, one per TypeDoc reflection kind.
 *
 * A hand-written nested document uses a descriptive segment such as `examples/`, so
 * membership in this set is what distinguishes a generated topic from a nested one.
 */
const GENERATED_TOPIC_DIRECTORIES: ReadonlySet<string> = new Set([
  'classes',
  'enumerations',
  'functions',
  'interfaces',
  'types',
  'variables',
])

/**
 * Tests whether a topic identifier belongs to a generated API topic.
 *
 * Generated topics are named `<kind>/<Symbol>`, for example `interfaces/ArtifactDag`.
 * A hand-written nested document uses a descriptive segment such as
 * `examples/implementing-a-port`, which is not a reflection kind.
 *
 * @param topic - Bare topic identifier, without the collection prefix.
 * @returns True when the topic addresses a generated API reflection.
 */
export function isGeneratedTopic(topic: string): boolean {
  const separatorIndex = topic.indexOf('/')
  if (separatorIndex === -1) {
    return false
  }
  return GENERATED_TOPIC_DIRECTORIES.has(topic.slice(0, separatorIndex))
}
