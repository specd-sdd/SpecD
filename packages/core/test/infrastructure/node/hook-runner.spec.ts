import { describe, expect, it, vi, afterEach } from 'vitest'
import { NodeHookRunner } from '../../../src/infrastructure/node/hook-runner.js'
import { TemplateExpander } from '../../../src/application/template-expander.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NodeHookRunner', () => {
  const expander = new TemplateExpander({ project: { root: '/my/project' } })
  const runner = new NodeHookRunner(expander)

  describe('run', () => {
    it('inserts a developer-quoted value without adding quotes', async () => {
      const result = await runner.run(
        'node -e "process.stdout.write(process.argv[1])" "{{change.name}}"',
        {
          change: { name: 'a b %PATH% &' },
        },
      )

      expect(result.exitCode()).toBe(0)
      const expandedPath = process.platform === 'win32' ? process.env['PATH'] : '%PATH%'
      expect(result.stdout()).toBe(`a b ${expandedPath} &`)
    })

    it('keeps several variables inside one pair of quotes', async () => {
      const result = await runner.run(
        'node -e "process.stdout.write(process.argv[1])" "{{project.root}}/{{change.name}}"',
        {
          change: { name: 'add-auth' },
        },
      )

      expect(result.stdout()).toBe('/my/project/add-auth')
    })

    it('treats doubled quotes inside double quotes as one literal quote', async () => {
      const result = await runner.run(
        'node -e "process.stdout.write(process.argv[1])" "Resultado: ""listo"""',
        {},
      )

      expect(result.exitCode()).toBe(0)
      expect(result.stdout()).toBe('Resultado: "listo"')
    })

    it('runs a shell command and returns exit code 0 on success', async () => {
      const result = await runner.run('node -e "process.exit(0)"', {})

      expect(result.exitCode()).toBe(0)
      expect(result.isSuccess()).toBe(true)
    })

    it('captures stdout', async () => {
      const result = await runner.run('node -e "process.stdout.write(\'line1\\nline2\')"', {})

      expect(result.stdout()).toContain('line1')
      expect(result.stdout()).toContain('line2')
    })

    it('captures stderr', async () => {
      const result = await runner.run('node -e "process.stderr.write(\'err\')"', {})

      expect(result.stderr().trim()).toBe('err')
    })

    it('emits stdout and stderr progress before completion', async () => {
      const events: Array<{ type: string; stream?: string; line?: string }> = []

      const result = await runner.run(
        "node -e \"process.stdout.write('line1\\n'); process.stderr.write('line2\\n')\"",
        {},
        (event) => events.push(event),
      )

      expect(events).toContainEqual({ type: 'output', stream: 'stdout', line: 'line1' })
      expect(events).toContainEqual({ type: 'output', stream: 'stderr', line: 'line2' })
      expect(result.stdout()).toContain('line1')
      expect(result.stderr()).toContain('line2')
    })

    it('emits a heartbeat for a quiet but still-running process', async () => {
      const events: Array<{ type: string; elapsedMs?: number }> = []

      const result = await runner.run('node -e "setTimeout(() => {}, 5200)"', {}, (event) =>
        events.push(event),
      )

      expect(result.exitCode()).toBe(0)
      expect(
        events.some((event) => event.type === 'heartbeat' && (event.elapsedMs ?? 0) >= 5000),
      ).toBe(true)
    }, 10000)

    it('returns non-zero exit code on failure', async () => {
      const result = await runner.run('exit 42', {})

      expect(result.exitCode()).not.toBe(0)
      expect(result.isSuccess()).toBe(false)
    })

    it('returns non-zero exit code for command not found', async () => {
      const result = await runner.run('nonexistent_command_xyz_12345', {})

      expect(result.isSuccess()).toBe(false)
    })

    it('expands builtin template variables in the command', async () => {
      const result = await runner.run('echo {{project.root}}', {})

      expect(result.stdout().trim()).toBe('/my/project')
    })

    it('expands change variables when present', async () => {
      const result = await runner.run('echo {{change.name}}', {
        change: { name: 'add-auth', path: '/tmp/changes/add-auth' },
      })

      expect(result.stdout().trim()).toBe('add-auth')
    })

    it('preserves unexpanded variables when path is unknown', async () => {
      const result = await runner.run(
        'node -e "process.stdout.write(process.argv[1])" "{{unknown.path}}"',
        {},
      )

      expect(result.stdout().trim()).toBe('{{unknown.path}}')
    })

    it('falls back to default shell when SHELL env is not absolute', async () => {
      const originalShell = process.env['SHELL']
      process.env['SHELL'] = 'relative-shell'

      try {
        const result = await runner.run('echo ok', {})
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
