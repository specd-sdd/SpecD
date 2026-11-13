/**
 * Decides whether an indexing run covers every workspace the store holds.
 *
 * A run that covers all stored workspaces may replace the whole derived graph. A run over a
 * strict subset must clear and regenerate only its own workspaces and leave the others intact.
 * @param storedWorkspaces - Workspace names that currently own stored files or documents.
 * @param indexedWorkspaces - Workspace names selected by the run.
 * @returns True when every stored workspace is indexed by the run.
 */
export function replacesWholeGraph(
  storedWorkspaces: Iterable<string>,
  indexedWorkspaces: ReadonlySet<string>,
): boolean {
  for (const workspace of storedWorkspaces) {
    if (!indexedWorkspaces.has(workspace)) return false
  }
  return true
}
