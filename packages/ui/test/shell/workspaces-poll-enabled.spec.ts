/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { isWorkspacesPollEnabled } from '../../src/shell/workspaces-poll-enabled.js'

describe('isWorkspacesPollEnabled', () => {
  it('given expanded sidebar and changes-hub center, when gating, then poll is enabled', () => {
    expect(isWorkspacesPollEnabled(false, 'changes-hub')).toBe(true)
  })

  it('given collapsed sidebar and changes-hub center, when gating, then poll is disabled', () => {
    expect(isWorkspacesPollEnabled(true, 'changes-hub')).toBe(false)
  })

  it('given collapsed sidebar and workspaces-hub center, when gating, then poll is enabled', () => {
    expect(isWorkspacesPollEnabled(true, 'workspaces-hub')).toBe(true)
  })

  it('given collapsed sidebar and open spec center, when gating, then poll is enabled', () => {
    expect(isWorkspacesPollEnabled(true, 'spec')).toBe(true)
  })
})
