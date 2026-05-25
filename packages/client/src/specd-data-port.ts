import type { PortArchivedChanges } from './port-archived-changes.js'
import type { PortChangesCollection } from './port-changes-collection.js'
import type { PortChangesMutate } from './port-changes-mutate.js'
import type { PortChangesRead } from './port-changes-read.js'
import type { PortGraph } from './port-graph.js'
import type { PortProject } from './port-project.js'
import type { PortWorkspacesSpecs } from './port-workspaces-specs.js'
import type { PortStudioPanel } from './port-studio-panel.js'

/**
 * Aggregated Studio data port — single interface for `@specd/ui` hooks.
 * Implemented by remote HTTP, in-memory fixtures, and desktop IPC adapters.
 */
export type SpecdDataPort = PortProject &
  PortChangesCollection &
  PortChangesRead &
  PortChangesMutate &
  PortArchivedChanges &
  PortWorkspacesSpecs &
  PortGraph &
  PortStudioPanel
