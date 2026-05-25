import { contextBridge, ipcRenderer } from 'electron'

/**
 *
 */
import type { IpcRequestEnvelope, IpcResponseEnvelope } from '@specd/client'
import { DRAFT_AWARE_IPC_METHODS } from '@specd/client'

export type SpecdIpcEnvelope = IpcRequestEnvelope

export type SpecdIpcResult = IpcResponseEnvelope

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

contextBridge.exposeInMainWorld('specd', {
  invoke,
  ping: () => invoke('ping'),
  previewChangeDraft: (name: string, input: unknown) => invoke('previewChangeDraft', [name, input]),
  outlineChangeArtifact: (name: string, filename: string, input?: unknown) =>
    invoke('outlineChangeArtifact', [name, filename, input]),
  outlineSpecDraft: (workspace: string, specPath: string, input: unknown) =>
    invoke('outlineSpecDraft', [workspace, specPath, input]),
  draftAwareMethods: DRAFT_AWARE_IPC_METHODS,
})
