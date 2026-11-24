import { type ChangeSchemaAdvisory, type Kernel, type ResolvedChangeSchema } from '@specd/sdk'
import { ChangeNotFoundError } from '@specd/sdk'

/**
 * Resolves a change's own schema through the shared Core resolver.
 *
 * Reads the change (active or drafted) from the repository and resolves its
 * recorded schema identity, never the workspace default schema.
 *
 * @param kernel - The wired kernel
 * @param changeName - The change whose schema to resolve
 * @returns The resolved schema and any resolver advisories
 * @throws {ChangeNotFoundError} When no active or drafted change has the given name
 */
export async function resolveChangeSchemaForCli(
  kernel: Kernel,
  changeName: string,
): Promise<ResolvedChangeSchema> {
  const change = await kernel.changes.repo.get(changeName)
  if (change !== null) {
    return await kernel.changes.resolveSchema.execute({
      changeName,
      schemaName: change.schemaName,
      schemaVersion: change.schemaVersion,
    })
  }
  const draft = await kernel.changes.repo.getDraft(changeName)
  if (draft === null) {
    throw new ChangeNotFoundError(changeName)
  }
  return await kernel.changes.resolveSchema.execute({
    changeName,
    schemaName: draft.schemaName,
    schemaVersion: draft.schemaVersion,
  })
}

/**
 * Formats resolver advisories as a text `warnings:` block.
 *
 * @param warnings - Advisories returned by the shared resolver
 * @returns The block (`warnings:` plus one `! <code>: <message>` line each), or `null` when empty
 */
export function formatSchemaAdvisories(warnings: readonly ChangeSchemaAdvisory[]): string | null {
  if (warnings.length === 0) return null
  return ['warnings:', ...warnings.map((w) => `  ! ${w.code}: ${w.message}`)].join('\n')
}
