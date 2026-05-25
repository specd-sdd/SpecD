/** IPC method names for draft-aware {@link SpecdDataPort} operations (desktop local mode). */
export const DRAFT_AWARE_IPC_METHODS = [
  'previewChangeDraft',
  'outlineChangeArtifact',
  'outlineSpecDraft',
] as const

export type DraftAwareIpcMethod = (typeof DRAFT_AWARE_IPC_METHODS)[number]

/**
 * @param method - IPC envelope method string.
 * @returns Whether the method is a draft-aware port operation.
 */
export function isDraftAwareIpcMethod(method: string): method is DraftAwareIpcMethod {
  return (DRAFT_AWARE_IPC_METHODS as readonly string[]).includes(method)
}
