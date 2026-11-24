import { describe, expect, it, vi } from 'vitest'
import { type ConfigWriter } from '../../src/application/ports/config-writer.js'
import { createConfigWriter } from '../../src/composition/config-writer.js'
import { FsConfigWriter } from '../../src/infrastructure/fs/config-writer.js'

describe('createConfigWriter', () => {
  it('returns a writer with initProject, addPlugin, removePlugin, and listPlugins', () => {
    const writer = createConfigWriter()

    expect(typeof writer.initProject).toBe('function')
    expect(typeof writer.addPlugin).toBe('function')
    expect(typeof writer.removePlugin).toBe('function')
    expect(typeof writer.listPlugins).toBe('function')
  })

  it('returns injected configWriter when options are provided', () => {
    const mock: ConfigWriter = {
      initProject: vi.fn(),
      addPlugin: vi.fn(),
      removePlugin: vi.fn(),
      listPlugins: vi.fn(),
    }

    expect(createConfigWriter({ configWriter: mock })).toBe(mock)
    expect(createConfigWriter({ configWriter: mock })).not.toBeInstanceOf(FsConfigWriter)
  })
})
