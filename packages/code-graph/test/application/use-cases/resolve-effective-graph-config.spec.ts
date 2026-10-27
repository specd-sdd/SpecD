import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_FILE_BYTES,
  resolveEffectiveGraphConfig,
} from '../../../src/application/use-cases/_shared/resolve-effective-graph-config.js'
import { type ProjectWorkspace } from '@specd/core'
import { type ProjectGraphConfig } from '../../../src/domain/value-objects/index-options.js'

function makeWorkspace(name: string): ProjectWorkspace {
  return {
    name,
    prefix: null,
    codeRoot: `/repo/packages/${name}`,
    isExternal: false,
    ownership: 'owned',
    specRepo: {
      specsPath: `/repo/packages/${name}/specs`,
      loadAll: () => [],
      load: () => undefined,
      find: () => [],
    } as unknown as ProjectWorkspace['specRepo'],
  }
}

describe('resolveEffectiveGraphConfig', () => {
  const ws1 = makeWorkspace('ws1')
  const ws2 = makeWorkspace('ws2')
  const workspaces = [ws1, ws2]

  it('resolves default limits (262144) and empty exemptions when config is empty', () => {
    const effective = resolveEffectiveGraphConfig('/repo', workspaces, {})

    expect(effective.rootMaxFileBytes).toBe(DEFAULT_MAX_FILE_BYTES)
    expect(effective.rootLargeFilePaths).toEqual([])

    const ws1Config = effective.workspaces.get('ws1')
    expect(ws1Config?.maxFileBytes).toBe(DEFAULT_MAX_FILE_BYTES)
    expect(ws1Config?.projectLargeFilePaths).toEqual([])
    expect(ws1Config?.workspaceLargeFilePaths).toEqual([])

    const ws2Config = effective.workspaces.get('ws2')
    expect(ws2Config?.maxFileBytes).toBe(DEFAULT_MAX_FILE_BYTES)
    expect(ws2Config?.projectLargeFilePaths).toEqual([])
    expect(ws2Config?.workspaceLargeFilePaths).toEqual([])
  })

  it('applies project-level maxFileBytes and largeFilePaths to root and workspaces', () => {
    const graphConfig: ProjectGraphConfig = {
      maxFileBytes: 500_000,
      largeFilePaths: ['generated/**', 'vendor/**'],
    }
    const effective = resolveEffectiveGraphConfig('/repo', workspaces, graphConfig)

    expect(effective.rootMaxFileBytes).toBe(500_000)
    expect(effective.rootLargeFilePaths).toEqual(['generated/**', 'vendor/**'])

    const ws1Config = effective.workspaces.get('ws1')
    expect(ws1Config?.maxFileBytes).toBe(500_000)
    expect(ws1Config?.projectLargeFilePaths).toEqual(['generated/**', 'vendor/**'])
    expect(ws1Config?.workspaceLargeFilePaths).toEqual([])
  })

  it('allows workspace to override maxFileBytes and supply workspace-level largeFilePaths', () => {
    const graphConfig: ProjectGraphConfig = {
      maxFileBytes: 500_000,
      largeFilePaths: ['project-exemption.ts'],
      workspaces: new Map([
        [
          'ws1',
          {
            maxFileBytes: 1_000_000,
            largeFilePaths: ['ws1-exemption.ts'],
          },
        ],
      ]),
    }
    const effective = resolveEffectiveGraphConfig('/repo', workspaces, graphConfig)

    expect(effective.rootMaxFileBytes).toBe(500_000)

    const ws1Config = effective.workspaces.get('ws1')
    expect(ws1Config?.maxFileBytes).toBe(1_000_000)
    expect(ws1Config?.projectLargeFilePaths).toEqual(['project-exemption.ts'])
    expect(ws1Config?.workspaceLargeFilePaths).toEqual(['ws1-exemption.ts'])

    // ws2 has no override, inherits project maxFileBytes
    const ws2Config = effective.workspaces.get('ws2')
    expect(ws2Config?.maxFileBytes).toBe(500_000)
    expect(ws2Config?.projectLargeFilePaths).toEqual(['project-exemption.ts'])
    expect(ws2Config?.workspaceLargeFilePaths).toEqual([])
  })

  it('preserves limit 0 as no limit without falling back to default', () => {
    const graphConfig: ProjectGraphConfig = {
      maxFileBytes: 0,
      workspaces: new Map([
        [
          'ws1',
          {
            maxFileBytes: 0,
          },
        ],
      ]),
    }
    const effective = resolveEffectiveGraphConfig('/repo', workspaces, graphConfig)

    expect(effective.rootMaxFileBytes).toBe(0)
    expect(effective.workspaces.get('ws1')?.maxFileBytes).toBe(0)
    expect(effective.workspaces.get('ws2')?.maxFileBytes).toBe(0)
  })

  it('copies arrays to prevent mutation of original inputs', () => {
    const rootPaths = ['root/**']
    const wsPaths = ['ws/**']
    const graphConfig: ProjectGraphConfig = {
      largeFilePaths: rootPaths,
      workspaces: new Map([
        [
          'ws1',
          {
            largeFilePaths: wsPaths,
          },
        ],
      ]),
    }
    const effective = resolveEffectiveGraphConfig('/repo', workspaces, graphConfig)

    expect(effective.rootLargeFilePaths).not.toBe(rootPaths)
    expect(effective.rootLargeFilePaths).toEqual(rootPaths)

    const ws1Config = effective.workspaces.get('ws1')
    expect(ws1Config?.workspaceLargeFilePaths).not.toBe(wsPaths)
    expect(ws1Config?.workspaceLargeFilePaths).toEqual(wsPaths)
  })
})
