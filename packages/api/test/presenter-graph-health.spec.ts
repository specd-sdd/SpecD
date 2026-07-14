import { describe, expect, it } from 'vitest'
import type { GetGraphHealthResult } from '@specd/sdk'
import { toGraphStatusDto } from '../src/delivery/http/presenters/presenter-graph.js'
import { toProjectStatusDtoFromSnapshot } from '../src/delivery/http/presenters/presenter-project.js'

const baseHealth = {
  lastIndexedAt: '2026-01-01T00:00:00.000Z',
  lastIndexedRef: '9bbfb3e2abc',
  fileCount: 10,
  documentCount: 2,
  symbolCount: 100,
  specCount: 5,
  graphFingerprint: 'fp',
  relationCounts: {},
  languages: ['typescript'],
  stale: true,
  currentRef: '63bf9049def',
  fingerprintMismatch: true,
} as unknown as GetGraphHealthResult

describe('graph health presenters', () => {
  it('toGraphStatusDto derives warnings', () => {
    const dto = toGraphStatusDto(baseHealth)
    expect(dto.warnings).toHaveLength(2)
    expect(dto.warnings[0]?.type).toBe('graph-stale')
    expect(dto.warnings[1]?.type).toBe('graph-fingerprint-mismatch')
    expect(dto.currentRef).toBe('63bf9049def')
    expect(dto.fingerprintMismatch).toBe(true)
  })

  it('toProjectStatusDtoFromSnapshot maps graph slice warnings', () => {
    const dto = toProjectStatusDtoFromSnapshot(
      {
        summary: {
          activeCount: 1,
          draftCount: 0,
          discardedCount: 0,
          archivedCount: 0,
          workspaceCount: 1,
          specsByWorkspace: { core: 1 },
        },
        approvals: { specEnabled: false, signoffEnabled: false },
        llmOptimizedContext: false,
        graphHealth: baseHealth,
      },
      'disabled',
    )
    expect(dto.graph?.warnings).toHaveLength(2)
    expect(dto.graph?.specCount).toBe(5)
    expect(dto.graph?.documentCount).toBe(2)
  })

  it('omits graph when snapshot has no graph health and preserves auth plus approvals', () => {
    const dto = toProjectStatusDtoFromSnapshot(
      {
        summary: {
          activeCount: 2,
          draftCount: 1,
          discardedCount: 0,
          archivedCount: 3,
          workspaceCount: 2,
          specsByWorkspace: { api: 4, core: 8 },
        },
        approvals: { specEnabled: true, signoffEnabled: false },
        llmOptimizedContext: false,
        graphHealth: null,
      },
      'session',
    )

    expect(dto.graph).toBeUndefined()
    expect(dto.auth).toEqual({ type: 'session' })
    expect(dto.approvals).toEqual({ specEnabled: true, signoffEnabled: false })
    expect(dto.specsByWorkspace).toEqual({ api: 4, core: 8 })
  })
})
