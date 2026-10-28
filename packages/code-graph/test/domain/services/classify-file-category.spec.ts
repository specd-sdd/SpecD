import { describe, expect, it } from 'vitest'
import {
  classifyFileCategory,
  explainFileCategory,
} from '../../../src/domain/services/classify-file-category.js'

describe('classifyFileCategory', () => {
  const defaultTestPatterns = [
    '**/*.spec.*',
    '**/*.test.*',
    '**/test/**',
    '**/tests/**',
    '**/__tests__/**',
    '*_test.*',
  ]

  it('classifies production files as source', () => {
    expect(classifyFileCategory('src/domain/model.ts', defaultTestPatterns, [])).toBe('source')
    expect(classifyFileCategory('pkg/service/user.go', defaultTestPatterns, [])).toBe('source')
    expect(classifyFileCategory('app/views/index.py', defaultTestPatterns, [])).toBe('source')
  })

  it('classifies matching test patterns across languages as test', () => {
    expect(classifyFileCategory('test/foo.spec.ts', defaultTestPatterns, [])).toBe('test')
    expect(classifyFileCategory('src/service.test.js', defaultTestPatterns, [])).toBe('test')
    expect(classifyFileCategory('tests/integration/api.py', defaultTestPatterns, [])).toBe('test')
    expect(classifyFileCategory('test/harness.py', defaultTestPatterns, [])).toBe('test')
    expect(classifyFileCategory('foo_test.go', defaultTestPatterns, [])).toBe('test')
    expect(classifyFileCategory('src/__tests__/app.tsx', defaultTestPatterns, [])).toBe('test')
  })

  it('classifies matching ignore patterns as ignored', () => {
    const ignorePatterns = ['fixtures/**', '**/scratch/**', '*.tmp']
    expect(
      classifyFileCategory('fixtures/mock-data.json', defaultTestPatterns, ignorePatterns),
    ).toBe('ignored')
    expect(
      classifyFileCategory('dev/scratch/test-script.sh', defaultTestPatterns, ignorePatterns),
    ).toBe('ignored')
    expect(classifyFileCategory('temp.tmp', defaultTestPatterns, ignorePatterns)).toBe('ignored')
  })

  it('gives precedence to ignored over test patterns', () => {
    // If a file matches both ignorePaths and testPaths, ignorePaths wins
    const testPatterns = ['**/*.spec.ts', 'test/**']
    const ignorePatterns = ['test/fixtures/**', '**/*.mock.spec.ts']

    expect(classifyFileCategory('test/fixtures/helper.spec.ts', testPatterns, ignorePatterns)).toBe(
      'ignored',
    )
    expect(classifyFileCategory('src/service.mock.spec.ts', testPatterns, ignorePatterns)).toBe(
      'ignored',
    )
    expect(classifyFileCategory('src/service.spec.ts', testPatterns, ignorePatterns)).toBe('test')
  })

  it('handles workspace-prefixed and non-normalized paths', () => {
    expect(classifyFileCategory('core:src/model.ts', defaultTestPatterns, [])).toBe('source')
    expect(classifyFileCategory('core:src/model.spec.ts', defaultTestPatterns, [])).toBe('test')
    expect(classifyFileCategory('./test/harness.ts', defaultTestPatterns, [])).toBe('test')
    expect(classifyFileCategory('src\\service.test.ts', defaultTestPatterns, [])).toBe('test')
  })
})

describe('explainFileCategory', () => {
  const defaults = ['**/*.spec.*', '**/test/**', '**/tests/**']

  it('Given a project-relative subject matching a project ignore pattern, then it is ignored at project level', () => {
    const result = explainFileCategory(
      'app/fixtures/a.php',
      'app',
      [
        { level: 'project', key: 'graph.ignorePaths', patterns: ['app/fixtures/**'] },
        { level: 'workspace', key: 'graph.ignorePaths', patterns: [] },
      ],
      [],
    )
    expect(result.category).toBe('ignored')
    expect(result.rule).toEqual({
      pattern: 'app/fixtures/**',
      negated: false,
      level: 'project',
      key: 'graph.ignorePaths',
    })
  })

  it('Given a workspace ignore pattern, then the rule is attributed to the workspace level', () => {
    const result = explainFileCategory(
      'packages/core/fixtures/a.ts',
      'packages/core',
      [
        { level: 'project', key: 'graph.ignorePaths', patterns: [] },
        { level: 'workspace', key: 'graph.ignorePaths', patterns: ['packages/core/fixtures/**'] },
      ],
      [],
    )
    expect(result.category).toBe('ignored')
    expect(result.rule?.level).toBe('workspace')
  })

  it('Given default test patterns, then project-relative test paths are test files', () => {
    const sources = [
      { level: 'project', key: 'graph.testPaths', patterns: defaults },
      { level: 'workspace', key: 'graph.testPaths', patterns: [] },
    ] as const
    expect(
      explainFileCategory('packages/core/src/a.spec.ts', 'packages/core', [], sources).category,
    ).toBe('test')
    expect(
      explainFileCategory('packages/core/test/b.ts', 'packages/core', [], sources).category,
    ).toBe('test')
    expect(explainFileCategory('packages/core/src/b.ts', 'packages/core', [], sources)).toEqual({
      category: 'source',
      rule: null,
    })
  })

  it('Given a workspace negation, then it cancels a project ignore pattern', () => {
    const result = explainFileCategory(
      'app/gen/keep.php',
      'app',
      [
        { level: 'project', key: 'graph.ignorePaths', patterns: ['app/gen/**'] },
        { level: 'workspace', key: 'graph.ignorePaths', patterns: ['!app/gen/keep.php'] },
      ],
      [],
    )
    expect(result.category).toBe('source')
  })

  it('keeps the legacy classifyFileCategory behaviour', () => {
    expect(classifyFileCategory('ws:src/a.spec.ts', defaults, [])).toBe('test')
    expect(classifyFileCategory('fixtures/a.ts', [], ['fixtures/**'])).toBe('ignored')
  })
})
