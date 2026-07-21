import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(testDir, '..')
const ipcHandlersSource = readFileSync(path.join(desktopRoot, 'src/main/ipc-handlers.ts'), 'utf8')

describe('desktop host lifecycle and status parity', () => {
  it('boots one SDK host per session and rejects superseded results', () => {
    expect(ipcHandlersSource).toContain('let hostPromiseGeneration = 0')
    expect(ipcHandlersSource).toContain('let hostPromise: Promise<DesktopHostContext> | undefined')
    expect(ipcHandlersSource).toContain(
      'if (hostPromise === undefined || hostPromiseGeneration !== gen)',
    )
    expect(ipcHandlersSource).toContain('const loader = await createDefaultConfigLoader({')
    expect(ipcHandlersSource).toContain(
      'const { kernel, createGraphProvider } = await createSdkContext(config, {',
    )
    expect(ipcHandlersSource).toContain('if (gen !== sessionGeneration) {')
    expect(ipcHandlersSource).toContain('throw new SessionSupersededError()')
  })

  it('routes project status through the canonical mapper and effective auth config', () => {
    expect(ipcHandlersSource).toContain('function toProjectStatusDtoFromSnapshot(')
    expect(ipcHandlersSource).toContain('return mapProjectStatusDto({')
    expect(ipcHandlersSource).toContain('approvals: snapshot.approvals,')
    expect(ipcHandlersSource).toContain("authType: config.api?.auth.type ?? 'disabled',")
    expect(ipcHandlersSource).not.toContain('toSdkHostContext')
  })

  it('tears down the long-lived graph provider on reset', () => {
    expect(ipcHandlersSource).toContain('let activeGraph: LongLivedGraphHolder | undefined')
    expect(ipcHandlersSource).toContain('activeGraph = graph')
    expect(ipcHandlersSource).toContain('export function resetDesktopKernel(): void')
    expect(ipcHandlersSource).toContain('const graph = activeGraph')
    expect(ipcHandlersSource).toContain('activeGraph = undefined')
    expect(ipcHandlersSource).toContain('void graph.provider.close().catch(() => undefined)')
    expect(ipcHandlersSource).toContain('hostPromise = undefined')
    expect(ipcHandlersSource).toContain('logRing = undefined')
    expect(ipcHandlersSource).not.toContain('openGraphProviders')
  })
})
