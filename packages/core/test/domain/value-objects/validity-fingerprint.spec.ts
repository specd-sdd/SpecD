import { describe, it, expect } from 'vitest'
import {
  normalizeTextV1,
  classifyContent,
  normalizeImplementationPath,
  compareArtifactFingerprints,
  compareImplementationFingerprints,
  compareValidityFingerprints,
  canonicalSpecIds,
  compareSpecApprovalFingerprints,
  type ArtifactFingerprint,
  type ImplementationFingerprint,
  type ValidityFingerprint,
} from '../../../src/domain/value-objects/validity-fingerprint.js'
import {
  DEFAULT_INVALIDATION_POLICY,
  LEGACY_DEFAULT_INVALIDATION_POLICY,
  resolveInvalidationPolicy,
  fromLegacyInvalidationPolicy,
  isInvalidationPolicy,
  isArtifactInvalidationPolicy,
  isWorkflowInvalidationPolicy,
} from '../../../src/domain/value-objects/invalidation-policy.js'

describe('InvalidationPolicy Value Object', () => {
  it('defines correct default values', () => {
    expect(DEFAULT_INVALIDATION_POLICY).toEqual({
      artifacts: 'downstream',
      workflow: 'preserve',
    })
    expect(LEGACY_DEFAULT_INVALIDATION_POLICY).toEqual({
      artifacts: 'downstream',
      workflow: 'redesign',
    })
  })

  it('validates policies using type guards', () => {
    expect(isArtifactInvalidationPolicy('downstream')).toBe(true)
    expect(isArtifactInvalidationPolicy('surgical')).toBe(true)
    expect(isArtifactInvalidationPolicy('none')).toBe(true)
    expect(isArtifactInvalidationPolicy('global')).toBe(true)
    expect(isArtifactInvalidationPolicy('invalid')).toBe(false)

    expect(isWorkflowInvalidationPolicy('preserve')).toBe(true)
    expect(isWorkflowInvalidationPolicy('redesign')).toBe(true)
    expect(isWorkflowInvalidationPolicy('reopen')).toBe(false)

    expect(isInvalidationPolicy({ artifacts: 'surgical', workflow: 'preserve' })).toBe(true)
    expect(isInvalidationPolicy({ artifacts: 'downstream', workflow: 'invalid' })).toBe(false)
    expect(isInvalidationPolicy(null)).toBe(false)
    expect(isInvalidationPolicy('downstream')).toBe(false)
  })

  it('resolves policy with partial overrides', () => {
    const base = DEFAULT_INVALIDATION_POLICY

    const overrodeWorkflow = resolveInvalidationPolicy(base, { workflow: 'redesign' })
    expect(overrodeWorkflow).toEqual({
      artifacts: 'downstream',
      workflow: 'redesign',
    })

    const overrodeArtifacts = resolveInvalidationPolicy(base, { artifacts: 'surgical' })
    expect(overrodeArtifacts).toEqual({
      artifacts: 'surgical',
      workflow: 'preserve',
    })

    const noOverride = resolveInvalidationPolicy(base)
    expect(noOverride).toEqual(base)
  })

  it('maps legacy scalar policy to structured policy with redesign workflow', () => {
    expect(fromLegacyInvalidationPolicy('surgical')).toEqual({
      artifacts: 'surgical',
      workflow: 'redesign',
    })
    expect(fromLegacyInvalidationPolicy(null)).toEqual(LEGACY_DEFAULT_INVALIDATION_POLICY)
    expect(fromLegacyInvalidationPolicy(undefined)).toEqual(LEGACY_DEFAULT_INVALIDATION_POLICY)
  })
})

describe('ValidityFingerprint - normalizeTextV1', () => {
  it('strips leading UTF-8 BOM', () => {
    const withBom = '\uFEFFHello World\n'
    expect(normalizeTextV1(withBom)).toBe('Hello World\n')
  })

  it('converts CRLF and lone CR to LF', () => {
    const input = 'line 1\r\nline 2\rline 3\n'
    expect(normalizeTextV1(input)).toBe('line 1\nline 2\nline 3\n')
  })

  it('strips trailing spaces and tabs from lines', () => {
    const input = 'const x = 1   \t\nconst y = 2  \n'
    expect(normalizeTextV1(input)).toBe('const x = 1\nconst y = 2\n')
  })

  it('turns whitespace-only lines into empty lines', () => {
    const input = 'header\n   \t  \nfooter\n'
    expect(normalizeTextV1(input)).toBe('header\n\nfooter\n')
  })

  it('preserves leading indentation and internal whitespace', () => {
    const input = '  function foo(a,   b) {\n    return a + b\n  }\n'
    expect(normalizeTextV1(input)).toBe('  function foo(a,   b) {\n    return a + b\n  }\n')
  })

  it('ensures exactly one terminal LF', () => {
    expect(normalizeTextV1('hello')).toBe('hello\n')
    expect(normalizeTextV1('hello\n\n\n')).toBe('hello\n')
    expect(normalizeTextV1('')).toBe('\n')
  })
})

describe('ValidityFingerprint - classifyContent', () => {
  it('classifies valid UTF-8 text as text', () => {
    const encoder = new TextEncoder()
    const bytes = encoder.encode('Hello, world! 🌍')
    expect(classifyContent(bytes)).toBe('text')
  })

  it('classifies content with NUL bytes as binary', () => {
    const bytes = new Uint8Array([0x48, 0x65, 0x00, 0x6c, 0x6f])
    expect(classifyContent(bytes)).toBe('binary')
  })

  it('classifies invalid UTF-8 sequences as binary', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x80, 0x81])
    expect(classifyContent(bytes)).toBe('binary')
  })
})

describe('ValidityFingerprint - normalizeImplementationPath', () => {
  it('normalizes backslashes to slashes', () => {
    expect(normalizeImplementationPath('packages\\core\\src\\index.ts')).toBe(
      'packages/core/src/index.ts',
    )
  })

  it('removes redundant dot segments and collapses slashes', () => {
    expect(normalizeImplementationPath('./packages/core/./src//index.ts')).toBe(
      'packages/core/src/index.ts',
    )
  })

  it('resolves .. segments within project root', () => {
    expect(normalizeImplementationPath('packages/core/src/../test/index.ts')).toBe(
      'packages/core/test/index.ts',
    )
  })

  it('throws on empty path', () => {
    expect(() => normalizeImplementationPath('')).toThrow()
  })

  it('throws on absolute path', () => {
    expect(() => normalizeImplementationPath('/etc/passwd')).toThrow()
  })

  it('throws on path escaping project root', () => {
    expect(() => normalizeImplementationPath('../outside.ts')).toThrow()
    expect(() => normalizeImplementationPath('packages/../../outside.ts')).toThrow()
  })
})

describe('ValidityFingerprint - comparisons', () => {
  const sampleArtifacts: ArtifactFingerprint = {
    version: 1,
    algorithm: 'artifact-pre-hash-v1',
    files: {
      'design:design.md': 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      'specs:core/config/spec.md':
        'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    },
  }

  const sampleImplementation: ImplementationFingerprint = {
    version: 1,
    hashAlgorithm: 'sha256',
    textNormalization: 'text-v1',
    binaryNormalization: 'bytes-v1',
    files: {
      'packages/core/src/index.ts': {
        hash: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
        content: 'text',
        normalization: 'text-v1',
      },
    },
  }

  it('reports equal when fingerprints match', () => {
    const cmp = compareArtifactFingerprints(sampleArtifacts, {
      ...sampleArtifacts,
      files: {
        'specs:core/config/spec.md':
          'sha256:2222222222222222222222222222222222222222222222222222222222222222',
        'design:design.md':
          'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      },
    })
    expect(cmp.equal).toBe(true)
    expect(cmp.differences).toHaveLength(0)
  })

  it('detects added, removed, and changed artifact files', () => {
    const modified: ArtifactFingerprint = {
      version: 1,
      algorithm: 'artifact-pre-hash-v1',
      files: {
        'design:design.md':
          'sha256:changedhash11111111111111111111111111111111111111111111111111111111',
        'proposal:proposal.md':
          'sha256:4444444444444444444444444444444444444444444444444444444444444444',
      },
    }

    const cmp = compareArtifactFingerprints(sampleArtifacts, modified)
    expect(cmp.equal).toBe(false)
    expect(cmp.differences).toEqual([
      {
        scope: 'artifact',
        key: 'design:design.md',
        kind: 'changed',
        expected: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        actual: 'sha256:changedhash11111111111111111111111111111111111111111111111111111111',
      },
      {
        scope: 'artifact',
        key: 'proposal:proposal.md',
        kind: 'added',
        actual: 'sha256:4444444444444444444444444444444444444444444444444444444444444444',
      },
      {
        scope: 'artifact',
        key: 'specs:core/config/spec.md',
        kind: 'removed',
        expected: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      },
    ])
  })

  it('detects implementation differences', () => {
    const modified: ImplementationFingerprint = {
      ...sampleImplementation,
      files: {
        'packages/core/src/index.ts': {
          hash: 'sha256:differenthash3333333333333333333333333333333333333333333333333333',
          content: 'text',
          normalization: 'text-v1',
        },
      },
    }

    const cmp = compareImplementationFingerprints(sampleImplementation, modified)
    expect(cmp.equal).toBe(false)
    expect(cmp.differences[0]).toMatchObject({
      scope: 'implementation',
      key: 'packages/core/src/index.ts',
      kind: 'changed',
    })
  })

  it('compares full validity fingerprint combining artifacts and implementation', () => {
    const valid: ValidityFingerprint = {
      version: 1,
      artifacts: sampleArtifacts,
      implementation: sampleImplementation,
    }

    const cmp = compareValidityFingerprints(valid, valid)
    expect(cmp.equal).toBe(true)
    expect(cmp.differences).toHaveLength(0)
  })

  it('canonicalizes approval scope and ignores order and duplicates', () => {
    expect(canonicalSpecIds(['core:b', 'core:a', 'core:b'])).toEqual(['core:a', 'core:b'])
    const expected = {
      version: 1 as const,
      specIds: ['core:a', 'core:b'],
      artifacts: sampleArtifacts,
    }
    const actual = {
      version: 1 as const,
      specIds: ['core:b', 'core:a', 'core:a'],
      artifacts: sampleArtifacts,
    }
    expect(compareSpecApprovalFingerprints(expected, actual)).toEqual({
      equal: true,
      differences: [],
    })
  })

  it('reports explicit spec-added and spec-removed differences', () => {
    const result = compareSpecApprovalFingerprints(
      { version: 1, specIds: ['core:a', 'core:removed'], artifacts: sampleArtifacts },
      { version: 1, specIds: ['core:a', 'core:added'], artifacts: sampleArtifacts },
    )
    expect(result).toEqual({
      equal: false,
      differences: [
        {
          scope: 'spec',
          key: 'core:added',
          kind: 'spec-added',
          actual: 'core:added',
        },
        {
          scope: 'spec',
          key: 'core:removed',
          kind: 'spec-removed',
          expected: 'core:removed',
        },
      ],
    })
  })
})
