import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mapProjectStatusDto } from '../src/dto/project-status.js'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const clientRoot = path.resolve(testDir, '..')

describe('mapProjectStatusDto', () => {
  it('maps all canonical fields from structural input', () => {
    const dto = mapProjectStatusDto({
      activeChanges: 2,
      drafts: 1,
      discarded: 3,
      archived: 4,
      specsByWorkspace: { core: 10, cli: 2 },
      graph: {
        lastIndexedAt: '2026-01-01T00:00:00.000Z',
        lastIndexedRef: '9bbfb3e2abc',
        stale: true,
        currentRef: '63bf9049def',
        fingerprintMismatch: true,
        fileCount: 10,
        documentCount: 2,
        symbolCount: 100,
        specCount: 5,
      },
      approvals: {
        specEnabled: true,
        signoffEnabled: false,
      },
      authType: 'disabled',
    })

    expect(dto).toEqual({
      activeChanges: 2,
      drafts: 1,
      discarded: 3,
      archived: 4,
      specsByWorkspace: { core: 10, cli: 2 },
      graph: {
        indexed: true,
        lastIndexedAt: '2026-01-01T00:00:00.000Z',
        lastIndexedRef: '9bbfb3e2abc',
        stale: true,
        currentRef: '63bf9049def',
        fingerprintMismatch: true,
        fileCount: 10,
        documentCount: 2,
        symbolCount: 100,
        specCount: 5,
        warnings: [
          {
            type: 'graph-stale',
            message: 'Graph is stale (indexed at 9bbfb3e, current: 63bf904)',
          },
          {
            type: 'graph-fingerprint-mismatch',
            message:
              'Derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index',
          },
        ],
      },
      approvals: {
        specEnabled: true,
        signoffEnabled: false,
      },
      auth: { type: 'disabled' },
    })
  })

  it('omits graph when graph health is unavailable', () => {
    const dto = mapProjectStatusDto({
      activeChanges: 0,
      drafts: 0,
      discarded: 0,
      archived: 0,
      graph: null,
      authType: 'disabled',
    })

    expect(dto.graph).toBeUndefined()
    expect(dto.auth).toEqual({ type: 'disabled' })
  })

  it('preserves nullable graph diagnostics and omits absent optional fields', () => {
    const dto = mapProjectStatusDto({
      activeChanges: 1,
      drafts: 0,
      discarded: 0,
      archived: 0,
      graph: {
        stale: null,
        fingerprintMismatch: null,
        lastIndexedAt: null,
        currentRef: null,
      },
      authType: 'disabled',
    })

    expect(dto.graph).toEqual({
      indexed: true,
      stale: null,
      fingerprintMismatch: null,
      lastIndexedAt: null,
      currentRef: null,
      warnings: [],
    })
    expect('lastIndexedRef' in (dto.graph ?? {})).toBe(false)
    expect('fileCount' in (dto.graph ?? {})).toBe(false)
  })

  it('clones mutable-looking inputs instead of retaining object identity', () => {
    const specsByWorkspace = { core: 4 }
    const approvals = { specEnabled: false, signoffEnabled: true }

    const dto = mapProjectStatusDto({
      activeChanges: 1,
      drafts: 2,
      discarded: 3,
      archived: 4,
      specsByWorkspace,
      approvals,
      authType: 'disabled',
    })

    specsByWorkspace.core = 99
    approvals.specEnabled = true

    expect(dto.specsByWorkspace).toEqual({ core: 4 })
    expect(dto.approvals).toEqual({ specEnabled: false, signoffEnabled: true })
  })

  it('returns the same value for repeated equivalent calls', () => {
    const input = {
      activeChanges: 1,
      drafts: 2,
      discarded: 3,
      archived: 4,
      graph: {
        stale: false,
        fingerprintMismatch: false,
        lastIndexedRef: 'same',
        currentRef: 'same',
      },
      authType: 'disabled',
    } as const

    expect(mapProjectStatusDto(input)).toEqual(mapProjectStatusDto(input))
  })
})

describe('client package boundaries', () => {
  it('keeps the canonical mapper free of core and sdk imports', () => {
    const source = readFileSync(path.join(clientRoot, 'src/dto/project-status.ts'), 'utf8')
    const packageJson = JSON.parse(readFileSync(path.join(clientRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    expect(source).not.toContain('@specd/core')
    expect(source).not.toContain('@specd/sdk')
    expect(packageJson.dependencies?.['@specd/core']).toBeUndefined()
    expect(packageJson.dependencies?.['@specd/sdk']).toBeUndefined()
  })
})
