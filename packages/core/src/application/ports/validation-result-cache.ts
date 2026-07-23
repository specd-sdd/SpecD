import { type Spec } from '../../domain/entities/spec.js'
import { type SpecRepository } from './spec-repository.js'

/** Cached validation outcome for one spec. */
export interface SpecValidationEntry {
  readonly spec: string
  readonly passed: boolean
  readonly failures: readonly { readonly artifactId: string; readonly description: string }[]
  readonly warnings: readonly { readonly artifactId: string; readonly description: string }[]
}

/** Result of a validation cache lookup — either a hit or a miss. */
export type ValidationCacheLookupResult =
  | { readonly kind: 'hit'; readonly entry: SpecValidationEntry }
  | { readonly kind: 'miss' }

/**
 * Application port for persisting and retrieving per-spec validation outcomes.
 *
 * One instance is bound to a single workspace. Host-facing surfaces MUST NOT
 * depend on this port — only {@link ValidateSpecs} consumes it via composition.
 */
export abstract class ValidationResultCache {
  /**
   * Creates a cache adapter bound to one workspace repository.
   *
   * @param specRepository - Same-workspace repository used for fingerprint I/O
   */
  protected constructor(protected readonly specRepository: SpecRepository) {}

  /** Returns the workspace name this cache instance serves. */
  abstract workspace(): string

  /**
   * Looks up a cached validation outcome using the freshness cascade.
   *
   * @param input - Spec entity, bucket schema fingerprint, and engine version
   * @returns A hit with the cached entry, or a miss
   */
  abstract lookup(input: {
    readonly spec: Spec
    readonly schemaFingerprint: string
    readonly engineVersion: number
  }): Promise<ValidationCacheLookupResult>

  /**
   * Persists or refreshes one cached validation row.
   *
   * @param input - Entry payload, spec stamps, and bucket validity inputs
   */
  abstract upsert(input: {
    readonly entry: SpecValidationEntry
    readonly spec: Spec
    readonly schemaFingerprint: string
    readonly engineVersion: number
  }): Promise<void>
}
