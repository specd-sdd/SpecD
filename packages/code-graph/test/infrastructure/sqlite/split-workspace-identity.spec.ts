import { describe, expect, it } from 'vitest'
import {
  isDriveLetterPath,
  splitWorkspaceIdentity,
  toPortableGraphPath,
} from '../../../src/domain/services/split-workspace-identity.js'

describe('splitWorkspaceIdentity', () => {
  it('does not treat a drive letter as a workspace', () => {
    expect(isDriveLetterPath('C:/repo/src/a.ts')).toBe(true)
    expect(isDriveLetterPath('c:\\repo\\src\\a.ts')).toBe(true)
    expect(splitWorkspaceIdentity('C:/repo/src/a.ts')).toBeNull()
    expect(isDriveLetterPath('C:')).toBe(true)
    expect(splitWorkspaceIdentity('C:')).toBeNull()
  })

  it('splits a workspace identity and keeps parent segments', () => {
    expect(splitWorkspaceIdentity('core:src/../secret')).toEqual({
      workspace: 'core',
      relativePath: 'src/../secret',
    })
  })

  it('keeps parent segments when converting separators', () => {
    expect(toPortableGraphPath('src\\..\\secret')).toBe('src/../secret')
  })

  it('returns null when there is no workspace prefix', () => {
    expect(splitWorkspaceIdentity('src/a.ts')).toBeNull()
  })
})
