import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const spawn = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ spawn }))

import { NodeHookRunner } from '../../../src/infrastructure/node/hook-runner.js'
import { TemplateExpander } from '../../../src/application/template-expander.js'

function fakeChild(): EventEmitter {
  const child = new EventEmitter()
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  Object.assign(child, { stdout, stderr })
  queueMicrotask(() => {
    child.emit('close', 0)
  })
  return child
}

describe('NodeHookRunner spawn', () => {
  const originalPlatform = process.platform
  const originalShell = process.env['SHELL']

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    if (originalShell === undefined) delete process.env['SHELL']
    else process.env['SHELL'] = originalShell
    spawn.mockReset()
  })

  it('spawns cmd.exe with verbatim arguments on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    spawn.mockImplementation(() => fakeChild())
    const runner = new NodeHookRunner(new TemplateExpander({ project: { root: 'C:/repo' } }))

    await runner.run('echo ok', {})

    expect(spawn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/d', '/s', '/c', 'echo ok'],
      expect.objectContaining({ windowsVerbatimArguments: true, windowsHide: true }),
    )
  })

  it('spawns the translated single-quoted command on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    spawn.mockImplementation(() => fakeChild())
    const runner = new NodeHookRunner(new TemplateExpander({ project: { root: 'C:/repo' } }))

    await runner.run("mkdir 'C:\\Users\\Ada Lovelace\\repo'", {})

    expect(spawn).toHaveBeenCalledWith(
      'cmd.exe',
      ['/d', '/s', '/c', 'mkdir "C:\\Users\\Ada Lovelace\\repo"'],
      expect.objectContaining({ windowsVerbatimArguments: true, windowsHide: true }),
    )
  })

  it('spawns an absolute shell with -c off Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    process.env['SHELL'] = '/bin/zsh'
    spawn.mockImplementation(() => fakeChild())
    const runner = new NodeHookRunner(new TemplateExpander({ project: { root: '/repo' } }))

    await runner.run('echo ok', {})

    expect(spawn).toHaveBeenCalledWith('/bin/zsh', ['-c', 'echo ok'], expect.any(Object))
  })

  it('falls back to /bin/sh when SHELL is not absolute', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    process.env['SHELL'] = 'zsh'
    spawn.mockImplementation(() => fakeChild())
    const runner = new NodeHookRunner(new TemplateExpander({ project: { root: '/repo' } }))

    await runner.run('echo ok', {})

    expect(spawn).toHaveBeenCalledWith('/bin/sh', ['-c', 'echo ok'], expect.any(Object))
  })
})
