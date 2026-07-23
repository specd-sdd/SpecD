import { type Change } from '../../domain/entities/change.js'
import { safeRegex } from '../../domain/services/safe-regex.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type SchemaProvider } from '../ports/schema-provider.js'

/** Completed, incomplete, and total task counts. */
export interface TaskCompletionStatus {
  readonly complete: number
  readonly incomplete: number
  readonly total: number
}
/** Input for {@link CountTasks}. */
export interface CountTasksInput {
  readonly change: Change
}
/** Result of counting task items in a change. */
export interface CountTasksResult {
  readonly byArtifact: Readonly<Record<string, TaskCompletionStatus>>
  readonly total: TaskCompletionStatus
}
/** Reads task-capable artifacts and aggregates their checkbox counts. */
export class CountTasks {
  /**
   * Creates the query.
   * @param _changes - Change content repository.
   * @param _schemaProvider - Active schema provider.
   */
  constructor(
    private readonly _changes: ChangeRepository,
    private readonly _schemaProvider: SchemaProvider,
  ) {}
  /**
   * Counts task items.
   * @param input - Change to inspect.
   * @returns Per-artifact and aggregate counts.
   */
  async execute(input: CountTasksInput): Promise<CountTasksResult> {
    const byArtifact: Record<string, TaskCompletionStatus> = {}
    let complete = 0
    let incomplete = 0
    const schema = await this._schemaProvider.get()
    for (const type of schema.artifacts()) {
      const check = type.taskCompletionCheck
      const artifact = input.change.getArtifact(type.id)
      if (!type.hasTasks || check === undefined || artifact === null) continue
      const incompleteRe = safeRegex(check.incompletePattern!, 'gm')
      const completeRe = safeRegex(check.completePattern!, 'gm')
      let artifactComplete = 0
      let artifactIncomplete = 0
      let hasContent = false
      for (const file of artifact.files.values()) {
        const loaded = await this._changes.artifact(input.change, file.filename)
        if (loaded === null || loaded.content.length === 0) continue
        hasContent = true
        artifactIncomplete +=
          incompleteRe === null ? 0 : (loaded.content.match(incompleteRe) ?? []).length
        artifactComplete +=
          completeRe === null ? 0 : (loaded.content.match(completeRe) ?? []).length
      }
      if (!hasContent) continue
      const total = artifactComplete + artifactIncomplete
      byArtifact[type.id] = { complete: artifactComplete, incomplete: artifactIncomplete, total }
      complete += artifactComplete
      incomplete += artifactIncomplete
    }
    return { byArtifact, total: { complete, incomplete, total: complete + incomplete } }
  }
}
