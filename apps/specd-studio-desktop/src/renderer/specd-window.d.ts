import type { DraftAwareIpcMethod } from '@specd/client'

export {}

declare global {
  interface Window {
    specd?: {
      ping: () => Promise<unknown>
      invoke: (method: string, payload?: unknown) => Promise<unknown>
      previewChangeDraft: (name: string, input: unknown) => Promise<unknown>
      outlineChangeArtifact: (name: string, filename: string, input?: unknown) => Promise<unknown>
      outlineSpecDraft: (workspace: string, specPath: string, input: unknown) => Promise<unknown>
      draftAwareMethods: readonly DraftAwareIpcMethod[]
    }
  }
}
