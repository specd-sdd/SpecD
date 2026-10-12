import { describe, expect, it } from 'vitest'
import { classifyFileCategory } from '../../../src/domain/services/classify-file-category.js'

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
