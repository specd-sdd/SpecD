import { describe, expect, it } from 'vitest'
import {
  isDriveLetterPath,
  splitWorkspaceIdentity,
  toPortableGraphPath,
} from '../../../src/domain/services/split-workspace-identity.js'

// Retained for historical import path; full matrix lives in test/domain/services/.
describe('splitWorkspaceIdentity (sqlite suite alias)', () => {
  it('does not treat a drive letter as a workspace', () => {
    expect(isDriveLetterPath('C:/repo/src/a.ts')).toBe(true)
    expect(splitWorkspaceIdentity('C:/repo/src/a.ts')).toBeNull()
  })

  it('keeps parent segments when converting separators', () => {
    expect(toPortableGraphPath('src\\..\\secret')).toBe('src/../secret')
  })
})
