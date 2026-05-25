export type { SpecdDataPort } from './specd-data-port.js'

export type { PortProject } from './port-project.js'
export type { PortChangesCollection } from './port-changes-collection.js'
export type { PortChangesRead, ChangeArtifactListItemDto } from './port-changes-read.js'
export type { PortChangesMutate } from './port-changes-mutate.js'
export type { PortArchivedChanges } from './port-archived-changes.js'
export type { PortWorkspacesSpecs } from './port-workspaces-specs.js'
export type { PortGraph } from './port-graph.js'
export type {
  PortStudioPanel,
  AppendProjectLogInput,
  AppendStudioOutputInput,
} from './port-studio-panel.js'

export type {
  HttpRequestOptions,
  HttpTransport,
  CreateHttpTransportOptions,
} from './port-http-transport.js'
export { createHttpTransport, normalizeApiBaseUrl } from './port-http-transport.js'

export { withBearerAuth } from './adapter-bearer-auth.js'
export { withProblemJsonErrors } from './adapter-problem-json-errors.js'
export {
  RemoteSpecdDataAdapter,
  createRemoteSpecdDataAdapter,
  testRemoteConnection,
  type RemoteSpecdDataAdapterOptions,
} from './adapter-remote-specd-data.js'
export {
  MemorySpecdDataAdapter,
  createMemorySpecdDataAdapter,
} from './adapter-memory-specd-data.js'

export {
  SpecdClientError,
  ArtifactConflictError,
  type ProblemJsonBody,
} from './errors/specd-client-error.js'

export * from './dto/index.js'
export * from './inputs.js'

export type {
  SpecdConnectionProfile,
  RemoteConnectionProfile,
  EmbeddedConnectionProfile,
  DesktopLocalConnectionProfile,
} from './types/connection-profile.js'

export {
  createIpcRequest,
  createIpcSuccess,
  createIpcFailure,
  type IpcRequestEnvelope,
  type IpcResponseEnvelope,
  type IpcErrorEnvelope,
} from './ipc/envelope.js'
export {
  DRAFT_AWARE_IPC_METHODS,
  isDraftAwareIpcMethod,
  type DraftAwareIpcMethod,
} from './ipc/draft-port-methods.js'
