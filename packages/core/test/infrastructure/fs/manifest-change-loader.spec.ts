import { describe, expect, it } from 'vitest'
import { loadChangeFromManifest } from '../../../src/infrastructure/fs/manifest-change-loader.js'
import {
  parseChangeManifest,
  rawVerificationAttemptSchema,
} from '../../../src/infrastructure/fs/manifest.js'
import { UnsupportedManifestVersionError } from '../../../src/domain/errors/unsupported-manifest-version-error.js'
import { CorruptedManifestError } from '../../../src/domain/errors/corrupted-manifest-error.js'

const actor = { name: 'Ada', email: 'ada@example.com' }

describe('loadChangeFromManifest', () => {
  it('hydrates physical projections without mutating the parsed manifest', () => {
    const manifest = parseChangeManifest({
      manifestVersion: 2,
      name: 'observational-load',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
      schema: { name: 'std', version: 1 },
      specIds: ['default:auth/login'],
      invalidation: { artifacts: 'downstream', workflow: 'preserve' },
      artifacts: [
        {
          type: 'proposal',
          optional: false,
          requires: [],
          state: 'in-progress',
          files: [
            {
              key: 'proposal',
              filename: 'proposal.md',
              state: 'in-progress',
              validatedHash: null,
            },
          ],
        },
      ],
      history: [
        {
          type: 'created',
          at: '2024-01-01T00:00:00.000Z',
          by: actor,
          specIds: ['default:auth/login'],
          schemaName: 'std',
          schemaVersion: 1,
        },
      ],
    })
    const before = JSON.stringify(manifest)

    const change = loadChangeFromManifest(manifest)

    expect(change.getArtifact('proposal')?.getFile('proposal')?.status).toBe('in-progress')
    expect(change.history).toHaveLength(1)
    expect(JSON.stringify(manifest)).toBe(before)
  })

  it.each(['pending-spec-approval', 'spec-approved', 'pending-signoff', 'archivable'] as const)(
    'accepts an attempt started from current state %s',
    (startedIn) => {
      const attempt = rawVerificationAttemptSchema.parse({
        id: 'verification-attempt-1',
        startedAt: '2024-01-01T00:00:00.000Z',
        startedBy: actor,
        startedIn,
        baseline: {
          version: 1,
          artifacts: { version: 1, algorithm: 'artifact-pre-hash-v1', files: {} },
          implementation: {
            version: 1,
            hashAlgorithm: 'sha256',
            textNormalization: 'text-v1',
            binaryNormalization: 'bytes-v1',
            files: {},
          },
        },
      })

      expect(attempt.startedIn).toBe(startedIn)
    },
  )

  it('adapts a v1 approval and later invalidation as stale legacy-unknown evidence', () => {
    const manifest = parseChangeManifest({
      name: 'legacy',
      createdAt: '2024-01-01T00:00:00.000Z',
      schema: { name: 'std', version: 1 },
      specIds: ['default:auth/login'],
      artifacts: [],
      history: [
        {
          type: 'created',
          at: '2024-01-01T00:00:00.000Z',
          by: actor,
          specIds: ['default:auth/login'],
          schemaName: 'std',
          schemaVersion: 1,
        },
        {
          type: 'spec-approved',
          at: '2024-01-02T00:00:00.000Z',
          by: actor,
          reason: 'looks good',
          artifactHashes: { 'proposal:proposal': `sha256:${'a'.repeat(64)}` },
        },
        {
          type: 'signed-off',
          at: '2024-01-03T00:00:00.000Z',
          by: actor,
          reason: 'ship it',
          artifactHashes: { 'proposal:proposal': `sha256:${'a'.repeat(64)}` },
        },
        {
          type: 'invalidated',
          at: '2024-01-04T00:00:00.000Z',
          by: actor,
          cause: 'artifact-change',
          message: 'drift',
          affectedArtifacts: [],
        },
      ],
    })

    const change = loadChangeFromManifest(manifest)
    expect(change.invalidationPolicy).toEqual({ artifacts: 'downstream', workflow: 'redesign' })
    expect(change.specApproval?.status).toBe('stale')
    expect(change.specApproval?.invalidation?.cause).toBe('legacy-unknown')
    expect(change.signoff?.status).toBe('stale')
    expect(change.signoff?.fingerprint.implementation).toBeNull()
    expect(change.verification.completed).toBeUndefined()
    const invalidated = change.history.find((event) => event.type === 'invalidated')
    expect(invalidated?.type === 'invalidated' && invalidated.cause).toBe('artifact-drift')
  })

  it('marks transitional v2 approvals without scope stale instead of inventing scope', () => {
    const digest = `sha256:${'b'.repeat(64)}`
    const manifest = parseChangeManifest({
      manifestVersion: 2,
      name: 'native',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
      schema: { name: 'std', version: 1 },
      specIds: ['default:auth/login'],
      invalidation: { artifacts: 'surgical', workflow: 'preserve' },
      artifacts: [],
      specApproval: {
        status: 'valid',
        decision: { at: '2024-01-02T00:00:00.000Z', by: actor, reason: 'ok' },
        fingerprint: {
          version: 1,
          algorithm: 'artifact-pre-hash-v1',
          files: { 'proposal:proposal': digest },
        },
      },
      history: [
        {
          type: 'created',
          at: '2024-01-01T00:00:00.000Z',
          by: actor,
          specIds: ['default:auth/login'],
          schemaName: 'std',
          schemaVersion: 1,
        },
      ],
    })

    const change = loadChangeFromManifest(manifest)
    expect(change.specApproval?.status).toBe('stale')
    expect(change.specApproval?.fingerprint.specIds).toEqual([])
    expect(change.specApproval?.invalidation?.cause).toBe('legacy-unknown')
    expect(change.invalidationPolicy).toEqual({ artifacts: 'surgical', workflow: 'preserve' })
    expect(change.signoff).toBeUndefined()
  })

  it('hydrates a native v2 scope-aware approval as current evidence', () => {
    const digest = `sha256:${'c'.repeat(64)}`
    const manifest = parseChangeManifest({
      manifestVersion: 2,
      name: 'native-scope',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
      schema: { name: 'std', version: 1 },
      specIds: ['default:auth/login'],
      invalidation: { artifacts: 'downstream', workflow: 'preserve' },
      artifacts: [],
      specApproval: {
        status: 'valid',
        decision: { at: '2024-01-02T00:00:00.000Z', by: actor, reason: 'ok' },
        fingerprint: {
          version: 1,
          specIds: ['default:auth/login'],
          artifacts: {
            version: 1,
            algorithm: 'artifact-pre-hash-v1',
            files: { 'proposal:proposal': digest },
          },
        },
      },
      history: [
        {
          type: 'created',
          at: '2024-01-01T00:00:00.000Z',
          by: actor,
          specIds: ['default:auth/login'],
          schemaName: 'std',
          schemaVersion: 1,
        },
      ],
    })

    const change = loadChangeFromManifest(manifest)
    expect(change.specApproval?.status).toBe('valid')
    expect(change.specApproval?.fingerprint.specIds).toEqual(['default:auth/login'])
    expect(change.specApproval?.invalidation).toBeUndefined()
  })

  it.each(['spec-added', 'spec-removed'] as const)(
    'accepts a strict v2 %s approval-invalidation difference',
    (kind) => {
      const manifest = parseChangeManifest({
        manifestVersion: 2,
        name: `scope-${kind}`,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        schema: { name: 'std', version: 1 },
        specIds: ['default:auth/login'],
        invalidation: { artifacts: 'downstream', workflow: 'preserve' },
        artifacts: [],
        history: [
          {
            type: 'approval-invalidated',
            at: '2024-01-02T00:00:00.000Z',
            by: actor,
            gate: 'spec',
            status: 'stale',
            cause: 'scope-change',
            reason: 'Scope changed',
            differences: [{ scope: 'spec', key: 'default:auth/login', kind }],
          },
        ],
      })

      expect(manifest.history[0]).toMatchObject({
        type: 'approval-invalidated',
        differences: [{ scope: 'spec', key: 'default:auth/login', kind }],
      })
    },
  )

  it.each([
    { scope: 'unknown', kind: 'spec-added' },
    { scope: 'spec', kind: 'unknown' },
  ])('rejects unknown strict v2 difference tokens: $scope/$kind', (difference) => {
    expect(() =>
      parseChangeManifest({
        manifestVersion: 2,
        name: 'invalid-difference',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        schema: { name: 'std', version: 1 },
        specIds: [],
        invalidation: { artifacts: 'downstream', workflow: 'preserve' },
        artifacts: [],
        history: [
          {
            type: 'approval-invalidated',
            at: '2024-01-02T00:00:00.000Z',
            by: actor,
            gate: 'spec',
            status: 'stale',
            cause: 'scope-change',
            reason: 'Scope changed',
            differences: [{ ...difference, key: 'default:auth/login' }],
          },
        ],
      }),
    ).toThrow(CorruptedManifestError)
  })

  it('rejects future manifest versions', () => {
    expect(() => parseChangeManifest({ manifestVersion: 3, name: 'x' })).toThrow(
      UnsupportedManifestVersionError,
    )
    expect(() => parseChangeManifest({ manifestVersion: 1, name: 'x' })).toThrow(
      UnsupportedManifestVersionError,
    )
  })
})
