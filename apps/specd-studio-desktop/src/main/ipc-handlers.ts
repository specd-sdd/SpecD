import {
  createConfigLoader,
  createKernel,
  SpecPath,
  type Kernel,
  type SpecdConfig,
} from '@specd/core'
import {
  createIpcFailure,
  createIpcSuccess,
  isDraftAwareIpcMethod,
  type IpcRequestEnvelope,
  type IpcResponseEnvelope,
} from '@specd/client'
import type {
  OutlineChangeArtifactInput,
  OutlineSpecDraftInput,
  PreviewChangeDraftInput,
} from '@specd/client'

let kernelPromise: Promise<Kernel> | undefined
let loadedConfig: SpecdConfig | undefined

/**
 * Lazily boots the project kernel for local IPC (cwd = project root).
 */
async function getKernel(): Promise<Kernel> {
  if (kernelPromise === undefined) {
    kernelPromise = (async () => {
      const loader = createConfigLoader({ startDir: process.cwd() })
      loadedConfig = await loader.load()
      return createKernel(loadedConfig)
    })()
  }
  return kernelPromise
}

/**
 * Handles draft-aware port methods via kernel use cases (mirrors HTTP handlers).
 *
 * @param envelope - IPC request envelope from preload.
 */
async function handleDraftAwarePort(envelope: IpcRequestEnvelope): Promise<IpcResponseEnvelope> {
  if (!isDraftAwareIpcMethod(envelope.method)) {
    return createIpcFailure(envelope.id, {
      message: `Not a draft-aware method: ${envelope.method}`,
    })
  }

  try {
    const kernel = await getKernel()
    const params = envelope.payload

    switch (envelope.method) {
      case 'previewChangeDraft': {
        const [name, input] = params as [string, PreviewChangeDraftInput]
        const result = await kernel.changes.preview.execute({
          name,
          specId: input.specId,
          ...(input.artifactOverrides !== undefined
            ? { artifactOverrides: input.artifactOverrides }
            : {}),
        })
        return createIpcSuccess(envelope.id, {
          specId: input.specId,
          files: result.files.map(
            (f: { filename: string; base?: string | null; merged?: string }) => ({
              filename: f.filename,
              ...(f.base !== undefined && f.base !== null ? { base: f.base } : {}),
              ...(f.merged !== undefined ? { merged: f.merged } : {}),
            }),
          ),
        })
      }
      case 'outlineChangeArtifact': {
        const [name, filename, input = {}] = params as [string, string, OutlineChangeArtifactInput?]
        const outline = await kernel.changes.outlineArtifact.execute({
          name,
          filename,
          ...(input.content !== undefined ? { content: input.content } : {}),
        })
        return createIpcSuccess(envelope.id, outline)
      }
      case 'outlineSpecDraft': {
        const [workspace, specPath, input] = params as [string, string, OutlineSpecDraftInput]
        const outline = await kernel.specs.getOutline.execute({
          workspace,
          specPath: SpecPath.parse(specPath),
          filename: input.filename,
          content: input.content,
        })
        return createIpcSuccess(envelope.id, outline)
      }
      default: {
        const _exhaustive: never = envelope.method
        return createIpcFailure(envelope.id, {
          message: `Unhandled method: ${String(_exhaustive)}`,
        })
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return createIpcFailure(envelope.id, { message })
  }
}

/**
 * Dispatches a single IPC envelope to ping, draft-aware port methods, or failure.
 *
 * @param envelope - Request from renderer preload.
 */
export async function dispatchIpc(envelope: IpcRequestEnvelope): Promise<IpcResponseEnvelope> {
  if (envelope.method === 'ping') {
    return createIpcSuccess(envelope.id, { pong: true })
  }
  if (isDraftAwareIpcMethod(envelope.method)) {
    return handleDraftAwarePort(envelope)
  }
  return createIpcFailure(envelope.id, {
    message: `IPC method not implemented: ${envelope.method}`,
  })
}

/**
 * Resets kernel state (e.g. after project folder switch).
 */
export function resetDesktopKernel(): void {
  kernelPromise = undefined
  loadedConfig = undefined
}
