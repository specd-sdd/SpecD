import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VcsAdapter } from '@specd/core'
import { VcsRepositoryRootSource } from '../../../src/infrastructure/vcs/vcs-repository-root-source.js'

class FakeVcsAdapter extends VcsAdapter {
  constructor(
    cwd: string,
    private readonly rootDirFn: () => string,
  ) {
    super(cwd)
  }

  override rootDir(): string {
    return this.rootDirFn()
  }

  override branch(): Promise<string> {
    return Promise.resolve('main')
  }

  override isClean(): Promise<boolean> {
    return Promise.resolve(true)
  }

  override ref(): Promise<string | null> {
    return Promise.resolve('test-ref')
  }

  override refAt(): Promise<string | null> {
    return Promise.resolve(null)
  }

  override modifiedFiles(): Promise<readonly string[]> {
    return Promise.resolve([])
  }

  override show(): Promise<string | null> {
    return Promise.resolve(null)
  }

  override async identity(): Promise<Awaited<ReturnType<VcsAdapter['identity']>>> {
    return { name: 'Test', email: 'test@example.com', provider: 'test' }
  }
}

describe('VcsRepositoryRootSource', () => {
  it('returns rootDir when VCS is detected', async () => {
    const repoRoot = join(tmpdir(), 'vcs-repo-root-test')
    const codeRoot = join(repoRoot, 'packages', 'core')
    const adapter = new FakeVcsAdapter(codeRoot, () => repoRoot)
    const source = new VcsRepositoryRootSource(async () => adapter)

    const result = await source.resolve(codeRoot)
    expect(result).toBe(repoRoot)
  })

  it('No detected VCS inspects only the code root (returns undefined when rootDir throws)', async () => {
    const codeRoot = join(tmpdir(), 'non-vcs-dir')
    const adapter = new FakeVcsAdapter(codeRoot, () => {
      throw new Error('no VCS detected')
    })
    const source = new VcsRepositoryRootSource(async () => adapter)

    const result = await source.resolve(codeRoot)
    expect(result).toBeUndefined()
  })

  it('VCS detection failure is not fatal (returns undefined when factory rejects)', async () => {
    const source = new VcsRepositoryRootSource(async () => {
      throw new Error('VCS adapter factory failed')
    })

    const result = await source.resolve(join(tmpdir(), 'any-dir'))
    expect(result).toBeUndefined()
  })
})
