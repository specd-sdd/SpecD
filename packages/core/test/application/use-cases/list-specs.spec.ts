import { describe, it, expect } from 'vitest'
import { ListSpecs } from '../../../src/application/use-cases/list-specs.js'
import { Spec } from '../../../src/domain/entities/spec.js'
import { SpecPath } from '../../../src/domain/value-objects/spec-path.js'
import { SpecArtifact } from '../../../src/domain/value-objects/spec-artifact.js'
import { type YamlSerializer } from '../../../src/application/ports/yaml-serializer.js'
import { makeSpecRepository, makeContentHasher } from './helpers.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeYamlSerializer(): YamlSerializer {
  return {
    parse(content: string): unknown {
      // Minimal YAML-like parser for test metadata strings
      const result: Record<string, string> = {}
      for (const line of content.split('\n')) {
        const match = line.match(/^(\w+):\s*(.+)$/)
        if (match) result[match[1]!] = match[2]!
      }
      return Object.keys(result).length > 0 ? result : null
    },
    stringify(): string {
      return ''
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ListSpecs', () => {
  it('lists specs from all workspaces', async () => {
    const spec1 = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const spec2 = new Spec('billing', SpecPath.parse('payments/stripe'), ['spec.md'])

    const repo1 = makeSpecRepository({ specs: [spec1] })
    const repo2 = makeSpecRepository({ specs: [spec2] })

    const specRepos = new Map([
      ['default', repo1],
      ['billing', repo2],
    ])

    const uc = new ListSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute()

    expect(result).toHaveLength(2)
    expect(result[0]!.workspace).toBe('default')
    expect(result[0]!.path).toBe('auth/login')
    expect(result[1]!.workspace).toBe('billing')
    expect(result[1]!.path).toBe('payments/stripe')
  })

  it('returns empty array when no specs exist', async () => {
    const repo = makeSpecRepository({ specs: [] })
    const specRepos = new Map([['default', repo]])

    const uc = new ListSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute()

    expect(result).toEqual([])
  })

  it('includes workspace name in entries', async () => {
    const spec = new Spec('billing', SpecPath.parse('invoices'), ['spec.md'])
    const repo = makeSpecRepository({ specs: [spec] })
    const specRepos = new Map([['billing', repo]])

    const uc = new ListSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute()

    expect(result).toHaveLength(1)
    expect(result[0]!.workspace).toBe('billing')
  })

  it('falls back to last path segment for title when no metadata', async () => {
    const spec = new Spec('default', SpecPath.parse('auth/login'), ['spec.md'])
    const repo = makeSpecRepository({ specs: [spec] })
    const specRepos = new Map([['default', repo]])

    const uc = new ListSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute()

    expect(result[0]!.title).toBe('login')
  })

  it('uses metadata title when available', async () => {
    const spec = new Spec('default', SpecPath.parse('auth/login'), [
      'spec.md',
      '.specd-metadata.yaml',
    ])
    const repo = makeSpecRepository({
      specs: [spec],
      artifacts: {
        'auth/login/.specd-metadata.yaml': 'title: Login Flow\ndescription: Handles user login',
      },
    })
    const specRepos = new Map([['default', repo]])

    const uc = new ListSpecs(specRepos, makeContentHasher(), makeYamlSerializer())
    const result = await uc.execute()

    expect(result[0]!.title).toBe('Login Flow')
  })
})
