import type { GuideSection } from './guide-section.js'
import type { GuideCollection, GuideSourcePath } from './guide-topic.js'

/**
 * Structural outline map of a guide document.
 */
export interface GuideOutline {
  /**
   * Collection identifier the document belongs to.
   */
  readonly collection: GuideCollection

  /**
   * Topic identifier within its collection.
   */
  readonly topic: string

  /**
   * Real source path of the document, relative to its collection root.
   *
   * For a hand-written document this is the relative path of the `.md` file
   * (e.g. 'ports.md', 'examples/implementing-a-port.md'). For a generated API
   * topic this is the relative path of the TypeScript declaration the symbol was
   * extracted from. This is never synthesized from the topic identifier.
   */
  readonly file: GuideSourcePath

  /**
   * Published package a generated API symbol is imported from.
   *
   * Present only on generated API topics, where it names the package an integrator
   * installs and imports rather than a path inside this repository.
   */
  readonly packageName?: string

  /**
   * Copy-pasteable import statement for a generated API symbol.
   *
   * Present only on generated API topics.
   */
  readonly importStatement?: string

  /**
   * Total number of lines in the document.
   */
  readonly lines: number

  /**
   * Total UTF-8 byte length of the document.
   */
  readonly bytes: number

  /**
   * Array of structural section descriptors.
   */
  readonly sections: readonly GuideSection[]
}
