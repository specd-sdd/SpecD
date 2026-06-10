export { SpecdApp, type SpecdAppMode, type SpecdAppProps } from './SpecdApp.js'
export { ConnectPanel, type ConnectPanelProps } from './connect/ConnectPanel.js'
export { SpecdDataProvider, useSpecdDataPort } from './context/specd-data-context.js'
export { useProjectPoll } from './hooks/use-project-poll.js'
export { useChangesCollection } from './hooks/use-changes-collection.js'
export { useChangesRead } from './hooks/use-changes-read.js'
export { useGraphStatus } from './hooks/use-graph-status.js'
export { useWorkspacesSpecsStub, useGraphStatusStub, useCommandPaletteStub } from './hooks/stubs.js'
export { ShellLayout, type ShellLayoutProps } from './shell/ShellLayout.js'
export { ArtifactEditor } from './editor/ArtifactEditor.js'
export { cn } from './lib/utils.js'

export type {
  SpecdConnectionProfile,
  RemoteConnectionProfile,
  RemoteSpecdDataAdapterOptions,
  ProjectDto,
} from '@specd/client'
