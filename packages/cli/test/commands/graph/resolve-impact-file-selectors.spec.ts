import { describe, expect, it } from 'vitest'
import { toGraphDisplayPath } from '../../../src/commands/graph/resolve-impact-file-selectors.js'
import { makeMockConfig } from '../helpers.js'

function configWithCoreWorkspace(): ReturnType<typeof makeMockConfig> {
  const base = makeMockConfig()
  return makeMockConfig({
    workspaces: [
      ...base.workspaces,
      {
        name: 'core',
        specsPath: '/project/core/specs',
        specsAdapter: { adapter: 'fs', config: { path: '/project/core/specs' } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: '/project/packages/core',
        ownership: 'owned' as const,
        isExternal: false,
      },
    ],
  })
}

describe('toGraphDisplayPath', () => {
  it('projects workspace-prefixed paths onto the project-relative code root', () => {
    const config = configWithCoreWorkspace()

    expect(toGraphDisplayPath(config, 'core:src/index.ts')).toBe('packages/core/src/index.ts')
  })

  it('returns the in-repository relative path for root-prefixed resources', () => {
    const config = configWithCoreWorkspace()

    expect(toGraphDisplayPath(config, 'root:package.json')).toBe('package.json')
    expect(toGraphDisplayPath(config, 'root:docs/guide.md')).toBe('docs/guide.md')
  })

  it('strips a leading ./ from projected display paths', () => {
    const config = makeMockConfig()

    expect(toGraphDisplayPath(config, 'root:./package.json')).toBe('package.json')
  })

  it('normalizes backslash separators to forward slashes', () => {
    const config = makeMockConfig()

    expect(toGraphDisplayPath(config, 'root:src\\nested\\file.ts')).toBe('src/nested/file.ts')
  })

  it('falls back to the canonical path when the identity does not parse', () => {
    const config = configWithCoreWorkspace()

    expect(toGraphDisplayPath(config, 'unknown-ws:src/file.ts')).toBe('unknown-ws:src/file.ts')
    expect(toGraphDisplayPath(config, 'no-separator.ts')).toBe('no-separator.ts')
    expect(toGraphDisplayPath(config, ':leading-colon')).toBe(':leading-colon')
    expect(toGraphDisplayPath(config, 'core:')).toBe('core:')
  })
})
