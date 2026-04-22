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
})
