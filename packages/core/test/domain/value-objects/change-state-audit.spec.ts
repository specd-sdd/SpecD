import { describe, expect, it } from 'vitest'
import {
  VALID_TRANSITIONS,
  type ChangeState,
} from '../../../src/domain/value-objects/change-state.js'

describe('VALID_TRANSITIONS (legacy parking states)', () => {
  it('has no edge into spec-approved or signed-off from any state', () => {
    for (const [source, exits] of Object.entries(VALID_TRANSITIONS) as [
      ChangeState,
      readonly ChangeState[],
    ][]) {
      expect(exits, `exits of ${source}`).not.toContain('spec-approved')
      expect(exits, `exits of ${source}`).not.toContain('signed-off')
    }
  })

  it('keeps existing exits for spec-approved and signed-off so historic manifests can leave', () => {
    expect(VALID_TRANSITIONS['spec-approved'].length).toBeGreaterThan(0)
    expect(VALID_TRANSITIONS['signed-off'].length).toBeGreaterThan(0)
  })

  it('lists pending-spec-approval exits with implementing first', () => {
    expect([...VALID_TRANSITIONS['pending-spec-approval']]).toEqual(['implementing', 'designing'])
  })

  it('lists pending-signoff exits with archivable first', () => {
    expect([...VALID_TRANSITIONS['pending-signoff']]).toEqual(['archivable', 'designing', 'done'])
  })
})
