import { describe, it, expect } from 'vitest'
import { GetSpec } from '../../../src/application/use-cases/get-spec.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { makeSpecRepository } from './helpers.js'

describe('GetSpec', () => {
  describe('when the spec exists', () => {
    it('returns spec with artifacts', async () => {
      const specPath = SpecPath.parse('auth/oauth')
      const spec = new Spec('default', specPath, ['spec.md', 'verify.md'])
      const repo = makeSpecRepository({
        specs: [spec],
        artifacts: {
          'auth/oauth/spec.md': '# Spec content',
          'auth/oauth/verify.md': '# Verify content',
        },
      })
      const specRepos = new Map([['default', repo]])
      const uc = new GetSpec(specRepos)

      const result = await uc.execute({ workspace: 'default', specPath })

      expect(result).not.toBeNull()
      expect(result!.spec).toBe(spec)
      expect(result!.artifacts.size).toBe(2)
      expect(result!.artifacts.get('spec.md')!.content).toBe('# Spec content')
      expect(result!.artifacts.get('verify.md')!.content).toBe('# Verify content')
    })

    it('only includes artifacts that exist on disk', async () => {
      const specPath = SpecPath.parse('auth/oauth')
      const spec = new Spec('default', specPath, ['spec.md', 'missing.md'])
      const repo = makeSpecRepository({
        specs: [spec],
        artifacts: {
          'auth/oauth/spec.md': '# Content',
        },
      })
      const specRepos = new Map([['default', repo]])
      const uc = new GetSpec(specRepos)

      const result = await uc.execute({ workspace: 'default', specPath })

      expect(result).not.toBeNull()
      expect(result!.artifacts.size).toBe(1)
      expect(result!.artifacts.has('spec.md')).toBe(true)
      expect(result!.artifacts.has('missing.md')).toBe(false)
    })
  })

  describe('when the workspace is not found', () => {
    it('returns null', async () => {
      const specRepos = new Map<string, ReturnType<typeof makeSpecRepository>>()
      const uc = new GetSpec(specRepos)

      const result = await uc.execute({
        workspace: 'unknown',
        specPath: SpecPath.parse('auth/oauth'),
      })

      expect(result).toBeNull()
    })
  })

  describe('when the spec is not found', () => {
    it('returns null', async () => {
      const repo = makeSpecRepository({ specs: [] })
      const specRepos = new Map([['default', repo]])
      const uc = new GetSpec(specRepos)

      const result = await uc.execute({
        workspace: 'default',
        specPath: SpecPath.parse('nonexistent/spec'),
      })

      expect(result).toBeNull()
    })
  })
})
