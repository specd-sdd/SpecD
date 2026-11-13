import type { GuideCollection, GuideSourcePath } from './guide-topic.js'

/**
 * Represents a ranked search result item from the guide search engine.
 */
export interface GuideSearchHit {
  /**
   * Collection identifier where the match was found.
   */
  readonly collection: GuideCollection

  /**
   * Topic identifier within its collection.
   */
  readonly topic: string

  /**
   * Real source path of the matched document, relative to its collection root.
   *
   * For a hand-written document this is the relative path of the `.md` file; for
   * a generated API topic this is the relative path of the TypeScript
   * declaration the symbol was extracted from. Never synthesized from the topic.
   */
  readonly file: GuideSourcePath

  /**
   * Heading title of the matched section.
   */
  readonly section: string

  /**
   * 1-indexed sequential index of the matched section within the guide document.
   */
  readonly sectionIndex: number

  /**
   * Heading depth level (e.g. 2 for '##').
   */
  readonly level: number

  /**
   * 1-indexed start line of the section in the source document.
   */
  readonly startLine: number

  /**
   * 1-indexed end line of the section in the source document.
   */
  readonly endLine: number

  /**
   * Relevance score computed by the BM25 algorithm.
   */
  readonly score: number

  /**
   * Line-numbered contextual snippet surrounding the match.
   */
  readonly snippet: string

  /**
   * Actionable copy-pasteable CLI command to view the matched section.
   *
   * The command name is derived from the hit's collection, so a hit in the SDK
   * collection emits `specd guide-sdk` and never `specd guide`.
   */
  readonly readCommand: string
}
