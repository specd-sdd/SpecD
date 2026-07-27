import { describe, expect, it } from 'vitest'
import { SaveChangeArtifact } from '../../../src/application/use-cases/save-change-artifact.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { makeChange, makeChangeRepository } from './helpers.js'

describe('SaveChangeArtifact', () => {
  it('returns updatedAt ISO string after saving artifact bytes', async () => {
    const change = makeChange('my-change')
    const repo = makeChangeRepository([change])
    const uc = new SaveChangeArtifact(repo)

    const result = await uc.execute({
      name: 'my-change',
      artifact: new SpecArtifact('proposal.md', '# Updated\n'),
    })

    expect(() => new Date(result.updatedAt)).not.toThrow()
    expect(result.updatedAt).toBe(repo.store.get('my-change')?.updatedAt.toISOString())
  })
})
