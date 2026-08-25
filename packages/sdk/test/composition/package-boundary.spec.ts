import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * specs/sdk/composition/verify.md
 */
describe('sdk:composition verification', () => {
  it('Scenario: SDK depends only on core and code-graph', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const specdDeps = Object.keys(packageJson.dependencies ?? {}).filter((name) =>
      name.startsWith('@specd/'),
    )
    expect(specdDeps.sort()).toEqual(['@specd/code-graph', '@specd/core'])
    expect(specdDeps).not.toContain('@specd/cli')
    expect(specdDeps).not.toContain('@specd/mcp')
  })

  it('keeps concrete suggestion wiring in composition', () => {
    const composition = ['suggest-implementation-links.ts', 'suggest-spec-dependencies.ts']
      .map((filename) => readFileSync(join(packageRoot, 'src/composition', filename), 'utf8'))
      .join('\n')
    expect(composition).toContain('FsImplementationSuggestionCache')
    expect(composition).toContain('FsSpecDepsSuggestionCache')
    expect(composition).toContain('createCompositionResolver')
    expect(composition).toContain('createSuggestImplementationLinksFromDeps')
    expect(composition).toContain('createSuggestSpecDependenciesFromDeps')
  })

  it('keeps suggestion application use cases free of filesystem and composition imports', () => {
    for (const filename of ['suggest-implementation-links.ts', 'suggest-spec-dependencies.ts']) {
      const source = readFileSync(join(packageRoot, 'src/application/use-cases', filename), 'utf8')
      expect(source).not.toMatch(/from ['"]node:fs/)
      expect(source).not.toContain('../../infrastructure/fs/')
      expect(source).not.toContain('createCompositionResolver')
      expect(source).not.toContain('configPath')
    }
  })

  it('does not export concrete filesystem caches from the SDK root', () => {
    const rootSource = readFileSync(join(packageRoot, 'src/index.ts'), 'utf8')
    expect(rootSource).not.toContain('FsImplementationSuggestionCache')
    expect(rootSource).not.toContain('FsSpecDepsSuggestionCache')
  })
})
