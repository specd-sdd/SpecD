import {
  Spec,
  type SpecArtifactEntry,
  type SpecSidecarStamp,
} from '../../src/domain/entities/spec.js'
import { SpecPath } from '../../src/domain/value-objects/spec-path.js'

const DEFAULT_MTIME = '2020-01-01T00:00:00.000Z'

const ABSENT_SIDECAR: SpecSidecarStamp = { present: false, lastModified: null }

/** Builds a {@link Spec} for tests from filenames and optional sidecar stamps. */
export function makeSpec(options: {
  readonly workspace?: string
  readonly name: SpecPath | string
  readonly filenames?: readonly string[]
  readonly artifacts?: readonly SpecArtifactEntry[]
  readonly persistedStateStamp?: SpecSidecarStamp
  readonly generatedMetadataStamp?: SpecSidecarStamp
}): Spec {
  const workspace = options.workspace ?? 'default'
  const name = typeof options.name === 'string' ? SpecPath.parse(options.name) : options.name
  const artifacts: readonly SpecArtifactEntry[] =
    options.artifacts ??
    (options.filenames ?? []).map((filename) => ({
      filename,
      lastModified: DEFAULT_MTIME,
    }))

  return new Spec(
    workspace,
    name,
    artifacts,
    options.persistedStateStamp ?? ABSENT_SIDECAR,
    options.generatedMetadataStamp ?? ABSENT_SIDECAR,
  )
}
