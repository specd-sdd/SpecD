import { describe, expect, it, vi, afterEach } from 'vitest'
import { NodeHookRunner } from '../../../src/infrastructure/node/hook-runner.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NodeHookRunner', () => {
  const runner = new NodeHookRunner()

  describe('run', () => {
    it('runs a shell command and returns exit code 0 on success', async () => {
      const result = await runner.run('echo "hello"', { project: { root: '/tmp' } })

      expect(result.exitCode()).toBe(0)
      expect(result.stdout().trim()).toBe('hello')
      expect(result.isSuccess()).toBe(true)
    })

    it('captures stdout', async () => {
      const result = await runner.run('printf "line1\nline2"', { project: { root: '/tmp' } })

      expect(result.stdout()).toContain('line1')
      expect(result.stdout()).toContain('line2')
    })

    it('captures stderr', async () => {
      const result = await runner.run('echo "err" >&2', { project: { root: '/tmp' } })

      expect(result.stderr().trim()).toBe('err')
    })

    it('returns non-zero exit code on failure', async () => {
      const result = await runner.run('exit 42', { project: { root: '/tmp' } })

      expect(result.exitCode()).not.toBe(0)
      expect(result.isSuccess()).toBe(false)
    })

    it('returns non-zero exit code for command not found', async () => {
      const result = await runner.run('nonexistent_command_xyz_12345', {
        project: { root: '/tmp' },
      })

      expect(result.isSuccess()).toBe(false)
    })

    it('expands template variables in the command', async () => {
      const result = await runner.run('echo {{project.root}}', {
        project: { root: '/my/project' },
      })

      expect(result.stdout().trim()).toBe('/my/project')
    })

    it('expands change variables when present', async () => {
      const result = await runner.run('echo {{change.name}}', {
        project: { root: '/tmp' },
        change: { name: 'add-auth', workspace: 'default', path: '/tmp/changes/add-auth' },
      })

      expect(result.stdout().trim()).toBe('add-auth')
    })

    it('preserves unexpanded variables when path is unknown', async () => {
      const result = await runner.run('echo "{{unknown.path}}"', {
        project: { root: '/tmp' },
      })

      expect(result.stdout().trim()).toBe('{{unknown.path}}')
    })

    it('falls back to default shell when SHELL env is not absolute', async () => {
      const originalShell = process.env['SHELL']
      process.env['SHELL'] = 'relative-shell'

      try {
        const result = await runner.run('echo ok', { project: { root: '/tmp' } })
        // Should still work using the fallback /bin/sh
        expect(result.exitCode()).toBe(0)
      } finally {
        if (originalShell !== undefined) {
          process.env['SHELL'] = originalShell
        } else {
          delete process.env['SHELL']
        }
      }
    })
  })
})
