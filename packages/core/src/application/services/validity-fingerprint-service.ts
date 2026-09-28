import { type ChangeRepository } from '../ports/change-repository.js'
import { type BinaryContentHasher } from '../ports/binary-content-hasher.js'
import { type ContentHasher } from '../ports/content-hasher.js'
import { type SchemaProvider } from '../ports/schema-provider.js'
import { type Change } from '../../domain/entities/change.js'
import { type FingerprintInputFailure } from '../../domain/services/change-validity.js'
import {
  classifyContent,
  normalizeImplementationPath,
  normalizeTextV1,
  type ImplementationFingerprintEntry,
  canonicalSpecIds,
  type SpecApprovalFingerprint,
  type Sha256Digest,
  type ValidityFingerprint,
} from '../../domain/value-objects/validity-fingerprint.js'
import { computeArtifactHash } from '../use-cases/_shared/compute-artifact-hash.js'

/** Result of collecting a validity fingerprint. A partial map is never returned. */
export interface FingerprintCollectionResult {
  readonly fingerprint: ValidityFingerprint | null
  readonly failures: readonly FingerprintInputFailure[]
}

/** Ports used to read and hash validity inputs. */
export interface ValidityFingerprintServiceDeps {
  readonly changes: ChangeRepository
  readonly hasher: ContentHasher
  readonly binaryHasher: BinaryContentHasher
  readonly schemaProvider: SchemaProvider
}

/**
 * Collects schema-selected artifact hashes and whole implementation-file fingerprints.
 *
 * Task artifacts are excluded. Any missing, unreadable, or unsafe input makes
 * `fingerprint` null so approval and verification cannot persist a partial baseline.
 */
export class ValidityFingerprintService {
  private readonly _deps: ValidityFingerprintServiceDeps

  /**
   * Creates a fingerprint service.
   *
   * @param deps - Repository, hashers, and schema provider
   */
  constructor(deps: ValidityFingerprintServiceDeps) {
    this._deps = deps
  }

  /**
   * Collects the artifact fingerprint and an empty implementation map.
   *
   * @param change - Change whose non-task artifacts are hashed
   * @returns A complete artifact fingerprint, or null when a required read fails
   */
  async artifactFingerprint(change: Change): Promise<FingerprintCollectionResult> {
    const artifacts = await this._collectArtifacts(change)
    if (artifacts.failures.length > 0) {
      return { fingerprint: null, failures: artifacts.failures }
    }
    return { fingerprint: fingerprint(artifacts.files, {}), failures: [] }
  }

  /**
   * Collects the complete, canonical evidence used by a spec approval.
   *
   * @param change - Change whose scope and non-task artifacts are fingerprinted
   * @returns Scope-aware approval fingerprint, or failures when inputs cannot be read
   */
  async specApprovalFingerprint(change: Change): Promise<{
    readonly fingerprint: SpecApprovalFingerprint | null
    readonly failures: readonly FingerprintInputFailure[]
  }> {
    const collected = await this.artifactFingerprint(change)
    if (collected.fingerprint === null) {
      return { fingerprint: null, failures: collected.failures }
    }
    return {
      fingerprint: {
        version: 1,
        specIds: canonicalSpecIds(change.specIds),
        artifacts: collected.fingerprint.artifacts,
      },
      failures: [],
    }
  }

  /**
   * Collects artifact hashes and every confirmed implementation file.
   *
   * @param change - Change whose artifacts and implementation links are hashed
   * @returns A complete fingerprint, or null when any required read fails
   */
  async completeFingerprint(change: Change): Promise<FingerprintCollectionResult> {
    const artifacts = await this._collectArtifacts(change)
    const implementation = await this._collectImplementation(change)
    const failures = [...artifacts.failures, ...implementation.failures]
    if (failures.length > 0) {
      return { fingerprint: null, failures }
    }
    return { fingerprint: fingerprint(artifacts.files, implementation.files), failures: [] }
  }

  /**
   *  collect artifacts.
   *
   * @param change - change
   * @returns  collect artifacts result
   */
  private async _collectArtifacts(change: Change): Promise<{
    readonly files: Readonly<Record<string, Sha256Digest>>
    readonly failures: readonly FingerprintInputFailure[]
  }> {
    const schema = await this._deps.schemaProvider.get()
    const files: Record<string, Sha256Digest> = {}
    const failures: FingerprintInputFailure[] = []
    const types = [...schema.artifacts()].sort((left, right) => left.id.localeCompare(right.id))

    for (const type of types) {
      if (type.hasTasks) continue
      const artifact = change.getArtifact(type.id)
      if (artifact === null) continue
      const entries = [...artifact.files.values()].sort((left, right) =>
        left.key.localeCompare(right.key),
      )
      for (const file of entries) {
        if (file.status === 'skipped') continue
        const key = `${type.id}:${file.key}`
        const loaded = await this._deps.changes.artifact(change, file.filename)
        if (loaded === null) {
          failures.push({
            scope: 'artifact',
            key,
            reason: 'missing',
            message: `Artifact file '${file.filename}' is missing`,
          })
          continue
        }
        files[key] = asDigest(
          computeArtifactHash(
            loaded.content,
            (content) => this._deps.hasher.hash(content),
            type.preHashCleanup,
          ),
        )
      }
    }

    return { files, failures }
  }

  /**
   *  collect implementation.
   *
   * @param change - change
   * @returns  collect implementation result
   */
  private async _collectImplementation(change: Change): Promise<{
    readonly files: Readonly<Record<string, ImplementationFingerprintEntry>>
    readonly failures: readonly FingerprintInputFailure[]
  }> {
    const files: Record<string, ImplementationFingerprintEntry> = {}
    const failures: FingerprintInputFailure[] = []
    const paths = new Set<string>()

    for (const link of change.implementationLinks) {
      try {
        paths.add(normalizeImplementationPath(link.file))
      } catch (error) {
        failures.push({
          scope: 'implementation',
          key: link.file,
          reason: 'invalid-path',
          message: error instanceof Error ? error.message : 'Implementation path is invalid',
        })
      }
    }

    for (const path of [...paths].sort()) {
      const read = await this._deps.changes.implementationFile(change, path)
      if (read.status !== 'found') {
        failures.push({
          scope: 'implementation',
          key: path,
          reason: read.status === 'outside-project' ? 'outside-project' : read.status,
          message: implementationFailureMessage(path, read.status),
        })
        continue
      }
      const kind = classifyContent(read.bytes)
      if (kind === 'text') {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(read.bytes)
        files[path] = {
          hash: asDigest(this._deps.hasher.hash(normalizeTextV1(text))),
          content: 'text',
          normalization: 'text-v1',
        }
      } else {
        files[path] = {
          hash: this._deps.binaryHasher.hash(read.bytes),
          content: 'binary',
          normalization: 'bytes-v1',
        }
      }
    }

    return { files, failures }
  }
}

/**
 * Fingerprint.
 *
 * @param artifacts - artifacts
 * @param implementation - implementation
 * @returns fingerprint result
 */
function fingerprint(
  artifacts: Readonly<Record<string, Sha256Digest>>,
  implementation: Readonly<Record<string, ImplementationFingerprintEntry>>,
): ValidityFingerprint {
  return {
    version: 1,
    artifacts: {
      version: 1,
      algorithm: 'artifact-pre-hash-v1',
      files: sortedRecord(artifacts),
    },
    implementation: {
      version: 1,
      hashAlgorithm: 'sha256',
      textNormalization: 'text-v1',
      binaryNormalization: 'bytes-v1',
      files: sortedRecord(implementation),
    },
  }
}

/**
 * Sorted record.
 *
 * @param record - record
 * @returns sorted record result
 */
function sortedRecord<T>(record: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  const sorted: Record<string, T> = {}
  for (const key of Object.keys(record).sort()) {
    const value = record[key]
    if (value !== undefined) sorted[key] = value
  }
  return sorted
}

/**
 * As digest.
 *
 * @param value - value
 * @returns as digest result
 * @throws {Error} When the hasher does not return a sha256 digest
 */
function asDigest(value: string): Sha256Digest {
  if (!value.startsWith('sha256:')) {
    throw new Error(`Content hasher must return sha256 digests, received '${value}'`)
  }
  return value as Sha256Digest
}

/**
 * Implementation failure message.
 *
 * @param path - path
 * @param status - status
 * @returns implementation failure message result
 */
function implementationFailureMessage(
  path: string,
  status: 'missing' | 'unreadable' | 'outside-project',
): string {
  if (status === 'missing') return `Implementation file '${path}' is missing`
  if (status === 'unreadable') return `Implementation file '${path}' is unreadable`
  return `Implementation file '${path}' is outside the project`
}
