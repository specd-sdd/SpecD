import { describe, expect, it } from 'vitest'
import { translateHookCommand } from '../../../src/infrastructure/node/translate-hook-command.js'

describe('translateHookCommand', () => {
  describe('cmd host', () => {
    it('turns a single-quoted path into one double-quoted argument', () => {
      expect(translateHookCommand("mkdir '{{change.path}}'", 'cmd')).toBe('mkdir "{{change.path}}"')
    })

    it('keeps a double-quoted path assembled from several variables', () => {
      expect(translateHookCommand('mkdir "{{year}}/{{month}}/{{change.name}}"', 'cmd')).toBe(
        'mkdir "{{year}}/{{month}}/{{change.name}}"',
      )
    })

    it('doubles a double quote that was inside single quotes', () => {
      expect(translateHookCommand(`echo 'say "hi"'`, 'cmd')).toBe('echo "say ""hi"""')
    })

    it('joins the POSIX single-quote idiom into one cmd string', () => {
      expect(translateHookCommand(`echo 'it'\\''s fine'`, 'cmd')).toBe('echo "it\'s fine"')
    })

    it('turns a POSIX escaped double quote into a cmd pair', () => {
      expect(translateHookCommand('echo "Resultado: \\"listo\\""', 'cmd')).toBe(
        'echo "Resultado: ""listo"""',
      )
    })

    it('leaves percent signs and unquoted text untouched', () => {
      expect(translateHookCommand('echo "100%" & cd %USERPROFILE%', 'cmd')).toBe(
        'echo "100%" & cd %USERPROFILE%',
      )
    })

    it('turns an empty single-quoted string into an empty double-quoted string', () => {
      expect(translateHookCommand("echo ''", 'cmd')).toBe('echo ""')
    })

    it('closes an unclosed single quote', () => {
      expect(translateHookCommand("echo 'open", 'cmd')).toBe('echo "open"')
    })
  })

  describe('posix host', () => {
    it('turns a cmd literal quote into a POSIX escaped quote', () => {
      expect(translateHookCommand('echo "Resultado: ""listo"""', 'posix')).toBe(
        'echo "Resultado: \\"listo\\""',
      )
    })

    it('keeps an empty double-quoted string empty', () => {
      expect(translateHookCommand('echo ""', 'posix')).toBe('echo ""')
    })

    it('keeps a trailing literal quote distinct from the closer', () => {
      expect(translateHookCommand('echo "hello"""', 'posix')).toBe('echo "hello\\""')
    })

    it('keeps single quotes, including a quote inside them', () => {
      expect(translateHookCommand(`echo 'it'\\''s fine'`, 'posix')).toBe(`echo 'it'\\''s fine'`)
    })

    it('keeps a single quote that appears inside double quotes', () => {
      expect(translateHookCommand(`echo "it's fine"`, 'posix')).toBe(`echo "it's fine"`)
    })

    it('leaves percent signs untouched', () => {
      expect(translateHookCommand('echo "100%"', 'posix')).toBe('echo "100%"')
    })
  })
})
