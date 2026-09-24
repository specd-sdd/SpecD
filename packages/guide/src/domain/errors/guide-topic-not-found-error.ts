import { SpecdGuideError } from './specd-guide-error.js'

/**
 * Thrown when a requested guide topic identifier cannot be found in the catalog.
 */
export class GuideTopicNotFoundError extends SpecdGuideError {
  private readonly _topic: string
  private readonly _availableTopics: readonly string[]

  /**
   * Machine-readable error code.
   *
   * @returns 'UNKNOWN_GUIDE_TOPIC'
   */
  override get code(): string {
    return 'UNKNOWN_GUIDE_TOPIC'
  }

  /**
   * The topic identifier that was requested.
   *
   * @returns The requested topic
   */
  get topic(): string {
    return this._topic
  }

  /**
   * The list of valid topic identifiers currently available.
   *
   * @returns Available topics
   */
  get availableTopics(): readonly string[] {
    return this._availableTopics
  }

  /**
   * Creates a new GuideTopicNotFoundError.
   *
   * @param topic - The topic identifier that was requested.
   * @param availableTopics - The list of valid topic identifiers currently available.
   */
  constructor(topic: string, availableTopics: readonly string[] = []) {
    const list =
      availableTopics.length > 0 ? ` Available topics: ${availableTopics.join(', ')}` : ''
    const msg =
      topic.trim().length === 0
        ? `Guide topic cannot be empty.${list}`
        : `Guide topic '${topic}' not found.${list}`
    super(msg)
    this._topic = topic
    this._availableTopics = availableTopics
  }
}
