import { type Schema } from '../../domain/value-objects/schema.js'
import { SchemaProviderIdentityMismatchError } from '../errors/schema-provider-identity-mismatch-error.js'
import { type SchemaProvider } from '../ports/schema-provider.js'

/** Input for resolving a change's named schema through the active provider. */
export interface ResolveChangeSchemaInput {
  /** The name of the change being resolved */
  readonly changeName: string
  /** The schema name recorded on the change */
  readonly schemaName: string
  /** The schema version recorded on the change */
  readonly schemaVersion: number
}

/** Advisory emitted when the resolved schema version differs from the one recorded on the change. */
export interface ChangeSchemaVersionAdvisory {
  /** Stable advisory code. */
  readonly code: 'SCHEMA_VERSION_DRIFT'
  /** The change whose recorded schema drifted. */
  readonly changeName: string
  /** The schema name recorded on the change. */
  readonly schemaName: string
  /** The schema version recorded on the change. */
  readonly recordedVersion: number
  /** The schema version the provider resolved. */
  readonly resolvedVersion: number
  /** Human-readable explanation. */
  readonly message: string
}

/** Advisories returned alongside a resolved change schema. */
export type ChangeSchemaAdvisory = ChangeSchemaVersionAdvisory

/** Result of resolving a change's schema. */
export interface ResolvedChangeSchema {
  /** The resolved schema. */
  readonly schema: Schema
  /** Non-fatal advisories about the resolution. */
  readonly warnings: readonly ChangeSchemaAdvisory[]
}

/**
 * Resolves a change's named schema through the shared `SchemaProvider`,
 * failing closed on provider identity mismatches.
 */
export class ResolveChangeSchema {
  /**
   * Creates a new `ResolveChangeSchema` instance.
   *
   * @param schemaProvider - The shared schema provider to resolve against
   */
  constructor(private readonly schemaProvider: SchemaProvider) {}

  /**
   * Resolves the schema named by `input.schemaName` and verifies provider identity.
   *
   * @param input - Change name and recorded schema identity
   * @returns The resolved schema and any same-name version drift advisory
   * @throws {SchemaProviderIdentityMismatchError} When the provider returns a differently named schema
   */
  async execute(input: ResolveChangeSchemaInput): Promise<ResolvedChangeSchema> {
    const schema = await this.schemaProvider.get(input.schemaName)

    if (schema.name() !== input.schemaName) {
      throw new SchemaProviderIdentityMismatchError(
        input.changeName,
        input.schemaName,
        schema.name(),
      )
    }

    const warnings: ChangeSchemaAdvisory[] = []
    if (schema.version() !== input.schemaVersion) {
      warnings.push({
        code: 'SCHEMA_VERSION_DRIFT',
        changeName: input.changeName,
        schemaName: input.schemaName,
        recordedVersion: input.schemaVersion,
        resolvedVersion: schema.version(),
        message: `Change '${input.changeName}' was created with schema '${input.schemaName}' version ${input.schemaVersion} but resolved version ${schema.version()}.`,
      })
    }

    return { schema, warnings }
  }
}
