import { type Spec, type SpecPath, type SpecRepository } from '@specd/core'

/** Builds a paginated list envelope for mock spec repositories. */
export function makeListResult(specs: Spec[]) {
  const items = specs.map((spec) => ({
    workspace: spec.workspace,
    path: spec.name.toFsPath('/'),
    title: spec.name.toString().split('/').at(-1) ?? spec.name.toString(),
  }))
  return {
    items,
    meta: { total: items.length, count: items.length, limit: items.length },
  }
}

/** Creates a mock {@link SpecRepository} with list/get stamp APIs used by graph indexing. */
export function makeMockSpecRepository(
  specs: Spec[] = [],
  metadataMap: Map<string, Record<string, unknown>> = new Map(),
): SpecRepository {
  const byPath = new Map(specs.map((spec) => [spec.name.toFsPath('/'), spec]))

  return {
    get specsPath() {
      return undefined
    },
    list: async () => makeListResult(specs),
    count: async () => specs.length,
    get: async (specPath: SpecPath) => byPath.get(specPath.toFsPath('/')) ?? null,
    persistedStateMeta: async (_spec: Spec, options?: { readonly includeHash?: boolean }) =>
      options?.includeHash === true
        ? { lastModified: new Date().toISOString(), hash: 'sha256:test' }
        : { lastModified: new Date().toISOString() },
    generatedMetadataMeta: async () => null,
    metadata: async (s: Spec) => {
      const meta = metadataMap.get(s.name.toString())
      return meta ?? { title: s.name.toString() }
    },
    readMetadataSnapshot: async (s: Spec) => {
      const meta = metadataMap.get(s.name.toString())
      if (meta === undefined) {
        return { kind: 'missing' as const, revision: null }
      }
      return { kind: 'present' as const, metadata: meta as never, revision: 'sha256:test' }
    },
    readPersistedState: async () => null,
    artifact: async () => ({ content: '# Spec Content' }),
  } as unknown as SpecRepository
}
