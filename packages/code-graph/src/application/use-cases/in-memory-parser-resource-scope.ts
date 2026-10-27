import {
  type ParserResourceScope,
  type ParserResourceDisposer,
  type ParserResourceCloseResult,
  type ParserResourceDisposalFailure,
} from '../../domain/value-objects/parser-resource-scope.js'

/**
 * In-memory implementation of ParserResourceScope.
 *
 * Holds parser-owned resources strongly until close() is called.
 * On close(), disposers are executed in reverse registration order, references are dropped,
 * and any errors thrown during disposal are collected and returned without rethrowing.
 */
export class InMemoryParserResourceScope implements ParserResourceScope {
  private entries: Array<{ resource: unknown; dispose?: ParserResourceDisposer | undefined }> = []

  /**
   * Number of resources registered in the current epoch.
   */
  get size(): number {
    return this.entries.length
  }

  /**
   * Registers a parser-owned resource in the current epoch.
   *
   * @param resource - Opaque parser-owned object.
   * @param dispose - Optional disposal callback.
   */
  register(resource: unknown, dispose?: ParserResourceDisposer): void {
    if (dispose !== undefined) {
      this.entries.push({ resource, dispose })
    } else {
      this.entries.push({ resource })
    }
  }

  /**
   * Closes the current epoch:
   * 1. Detaches current entries so re-entrant calls operate on an empty epoch.
   * 2. Runs disposers in reverse order inside individual try/catch blocks.
   * 3. Collects any failures.
   * 4. Returns the result with total registered resources and failures.
   *
   * @returns Close result containing total count and any disposal failures.
   */
  close(): ParserResourceCloseResult {
    const closing = this.entries
    this.entries = []
    const failures: ParserResourceDisposalFailure[] = []

    for (let i = closing.length - 1; i >= 0; i--) {
      const entry = closing[i]!
      if (entry.dispose === undefined) {
        continue
      }
      try {
        entry.dispose()
      } catch (error) {
        failures.push({
          index: i,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { registered: closing.length, failures }
  }
}
