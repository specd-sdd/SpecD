import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/**
 *
 */
import type { IpcRequestEnvelope, IpcResponseEnvelope } from '@specd/client'

const DRAFT_AWARE_IPC_METHODS = [
  'previewChangeDraft',
  'outlineChangeArtifact',
  'outlineSpecDraft',
] as const

export type SpecdIpcEnvelope = IpcRequestEnvelope

export type SpecdIpcResult = IpcResponseEnvelope

export type DesktopRecentConnection = {
  readonly kind: 'local' | 'remote'
  readonly path?: string
  readonly apiBaseUrl?: string
  readonly token?: string
}

export type DesktopSession = { readonly kind: 'local'; readonly path: string } | null

type RendererStorageBridge = {
  get: <T>(key: string) => T | null
  set: <T>(key: string, value: T) => void
  remove: (key: string) => void
}

let seq = 0

/**
 *
 * @param method
 * @param params
 */
async function invoke(method: string, payload?: unknown): Promise<unknown> {
  const envelope: SpecdIpcEnvelope = {
    id: `req-${++seq}`,
    method,
    ...(payload !== undefined ? { payload } : {}),
  }
  const response = (await ipcRenderer.invoke('specd:invoke', envelope)) as SpecdIpcResult
  if (!response.ok) {
    throw new Error(response.error?.message ?? 'IPC request failed')
  }
  return response.result
}

function subscribeToChannel<TPayload>(
  channel: string,
  callback: (payload: TPayload) => void,
): () => void {
  const listener = (_event: IpcRendererEvent, payload: TPayload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

function subscribeToSignal(channel: string, callback: () => void): () => void {
  const listener = () => callback()
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

contextBridge.exposeInMainWorld('specd', {
  platform: process.platform,
  invoke,
  ping: () => invoke('ping'),
  draftAwareMethods: DRAFT_AWARE_IPC_METHODS,
  storage: {
    get: <T>(key: string): T | null =>
      ipcRenderer.sendSync('storage:get-sync', { key }) as T | null,
    set: <T>(key: string, value: T): void => {
      ipcRenderer.sendSync('storage:set-sync', { key, value })
    },
    remove: (key: string): void => {
      ipcRenderer.sendSync('storage:remove-sync', { key })
    },
  } satisfies RendererStorageBridge,
  onSessionChange: (callback: (session: DesktopSession) => void) =>
    subscribeToChannel('session:change', callback),
  onSelectRecent: (callback: (recent: DesktopRecentConnection) => void) =>
    subscribeToChannel('session:select-recent', callback),
  onTriggerOpenProject: (callback: () => void) =>
    subscribeToSignal('session:trigger-open-project', callback),
  onTriggerClearRecents: (callback: () => void) =>
    subscribeToSignal('session:trigger-clear-recents', callback),
  onTriggerClose: (callback: () => void) => subscribeToSignal('session:trigger-close', callback),
})
