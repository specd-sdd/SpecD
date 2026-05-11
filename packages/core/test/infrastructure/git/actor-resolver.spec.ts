import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GitActorResolver } from '../../../src/infrastructure/git/actor-resolver.js'

vi.mock('../../../src/infrastructure/git/exec.js', () => ({
  git: vi.fn(),
}))

import { git } from '../../../src/infrastructure/git/exec.js'

const mockedGit = git as ReturnType<typeof vi.fn>

describe('GitActorResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('identity resolution', () => {
    it('returns actor identity from git config', async () => {
      mockedGit.mockResolvedValueOnce('TestUser')
      mockedGit.mockResolvedValueOnce('testuser@example.com')

      const resolver = new GitActorResolver('/some/path')
      const identity = await resolver.identity()

      expect(mockedGit).toHaveBeenCalledWith('/some/path', 'config', 'user.name')
      expect(mockedGit).toHaveBeenCalledWith('/some/path', 'config', 'user.email')
      expect(identity).toEqual({
        name: 'TestUser',
        email: 'testuser@example.com',
        provider: 'git',
      })
    })

    it('throws when user.name is not configured', async () => {
      mockedGit.mockRejectedValueOnce(new Error('git config user.name not set'))
      mockedGit.mockResolvedValueOnce('test@example.com')

      const resolver = new GitActorResolver('/some/path')
      await expect(resolver.identity()).rejects.toThrow('git config user.name not set')
    })

    it('throws when user.email is not configured', async () => {
      mockedGit.mockResolvedValueOnce('TestUser')
      mockedGit.mockRejectedValueOnce(new Error('git config user.email not set'))

      const resolver = new GitActorResolver('/some/path')
      await expect(resolver.identity()).rejects.toThrow('git config user.email not set')
    })
  })

  describe('provider field', () => {
    it('sets provider to "git"', async () => {
      mockedGit.mockResolvedValueOnce('TestUser')
      mockedGit.mockResolvedValueOnce('testuser@example.com')

      const resolver = new GitActorResolver('/some/path')
      const identity = await resolver.identity()
      expect(identity.provider).toBe('git')
    })
  })
})
