import { GetProjectSummary } from '../../application/use-cases/get-project-summary.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { createListArchived } from './list-archived.js'
import { createListChanges } from './list-changes.js'
import { createListDiscarded } from './list-discarded.js'
import { createListDrafts } from './list-drafts.js'
import { createListWorkspaces } from './list-workspaces.js'

/**
 * Constructs a `GetProjectSummary` instance wired with filesystem adapters.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createGetProjectSummary(config: SpecdConfig): GetProjectSummary {
  return new GetProjectSummary(
    createListChanges(config),
    createListDrafts(config),
    createListDiscarded(config),
    createListArchived(config),
    createListWorkspaces(config),
  )
}
