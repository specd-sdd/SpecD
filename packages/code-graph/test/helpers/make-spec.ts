import { Spec, SpecPath } from '@specd/core'

const DEFAULT_MTIME = '2020-01-01T00:00:00.000Z'

/** Builds a {@link Spec} for code-graph tests. */
export function makeSpec(options: {
  readonly workspace?: string
  readonly name: SpecPath | string
  readonly filenames?: readonly string[]
}): Spec {
  const workspace = options.workspace ?? 'default'
  const name = typeof options.name === 'string' ? SpecPath.parse(options.name) : options.name
  const artifacts = (options.filenames ?? []).map((filename) => ({
    filename,
    lastModified: DEFAULT_MTIME,
  }))
  const absentSidecar = { present: false, lastModified: null as string | null }

  return new Spec(workspace, name, artifacts, absentSidecar, absentSidecar)
}
