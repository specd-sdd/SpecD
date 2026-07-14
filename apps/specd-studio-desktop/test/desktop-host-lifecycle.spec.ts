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
    expect(ipcHandlersSource).toContain('const { kernel } = await createSdkContext(config, {')
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

  it('tears down tracked graph providers on reset and per-operation completion', () => {
    expect(ipcHandlersSource).toContain('openGraphProviders.add(provider)')
    expect(ipcHandlersSource).toContain('openGraphProviders.delete(provider)')
    expect(ipcHandlersSource).toContain('await provider.close().catch(() => undefined)')
    expect(ipcHandlersSource).toContain('for (const provider of openGraphProviders) {')
    expect(ipcHandlersSource).toContain('hostPromise = undefined')
    expect(ipcHandlersSource).toContain('logRing = undefined')
    expect(ipcHandlersSource).toContain('openGraphProviders.clear()')
  })
})
