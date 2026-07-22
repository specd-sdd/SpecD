import { describe, expect, it, vi } from 'vitest'
import { TemplateExpander } from '../../src/application/template-expander.js'

describe('TemplateExpander', () => {
  describe('unknown variable callback', () => {
    it('given unresolved token, when callback is configured, then callback is called and token is preserved', () => {
      const onUnknown = vi.fn<(token: string) => void>()
      const expander = new TemplateExpander({ project: { root: '/project' } }, onUnknown)

      const result = expander.expand('path={{unknown.variable}}')

      expect(result).toBe('path={{unknown.variable}}')
      expect(onUnknown).toHaveBeenCalledTimes(1)
      expect(onUnknown).toHaveBeenCalledWith('unknown.variable')
    })

    it('given unresolved token, when callback is not configured, then token is preserved without side effects', () => {
      const expander = new TemplateExpander({ project: { root: '/project' } })

      const result = expander.expand('path={{unknown.variable}}')

      expect(result).toBe('path={{unknown.variable}}')
    })
  })

  describe('expand', () => {
    it('expands a single token', () => {
      const expander = new TemplateExpander({ project: { root: '/home/dev/myapp' } })

      expect(expander.expand('Project at {{project.root}}')).toBe('Project at /home/dev/myapp')
    })

    it('expands multiple tokens without a workspace key', () => {
      const expander = new TemplateExpander({ project: { root: '/project' } })

      const result = expander.expand('{{change.name}} at {{change.path}}', {
        change: { name: 'add-auth', path: '/project/changes/add-auth' },
      })

      expect(result).toBe('add-auth at /project/changes/add-auth')
    })

    it('leaves {{change.workspace}} unexpanded when workspace is absent', () => {
      const expander = new TemplateExpander({ project: { root: '/project' } })

      const result = expander.expand('ws={{change.workspace}}', {
        change: { name: 'add-auth', path: '/project/changes/add-auth' },
      })

      expect(result).toBe('ws={{change.workspace}}')
    })

    it('prefers builtins over contextual variables on collision', () => {
      const expander = new TemplateExpander({ project: { root: '/builtin' } })

      const result = expander.expand('{{project.root}}', {
        project: { root: '/contextual' },
      })

      expect(result).toBe('/builtin')
    })

    it('does not expand nested object values', () => {
      const expander = new TemplateExpander({})

      const result = expander.expand('{{change.complex}}', {
        change: { complex: { nested: 'value' } as unknown as string },
      })

      expect(result).toBe('{{change.complex}}')
    })
  })

  describe('expandForShell', () => {
    it('shell-escapes substituted values', () => {
      const expander = new TemplateExpander({})

      const result = expander.expandForShell('echo {{change.name}}', {
        change: { name: "it's-fine" },
      })

      expect(result).toBe("echo 'it'\\''s-fine'")
    })
  })
})
