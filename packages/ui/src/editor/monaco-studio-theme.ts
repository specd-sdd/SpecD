import type { Monaco } from '@monaco-editor/react'

export const MONACO_SURFACE_HEX = '#14161a'
export const MONACO_LIGHT_HEX = '#ffffff'

let registered = false

/**
 * Registers Monaco themes with a fixed Studio editor background.
 * Safe to call on every mount; defines the themes once.
 */
export function onMonacoBeforeMount(monaco: Monaco): void {
  if (!registered) {
    monaco.editor.defineTheme('specd-studio-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': MONACO_SURFACE_HEX,
        'editorGutter.background': MONACO_SURFACE_HEX,
        'editor.lineHighlightBackground': MONACO_SURFACE_HEX,
        'editorWidget.background': MONACO_SURFACE_HEX,
        'editorPane.background': MONACO_SURFACE_HEX,
        'diffEditor.insertedLineBackground': '#3fb9501f',
        'diffEditor.removedLineBackground': '#f851491f',
      },
    })

    monaco.editor.defineTheme('specd-studio-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': MONACO_LIGHT_HEX,
        'editorGutter.background': MONACO_LIGHT_HEX,
        'editor.lineHighlightBackground': '#f6f8fa',
        'editorWidget.background': '#ffffff',
        'editorPane.background': '#ffffff',
        'diffEditor.insertedLineBackground': '#1a7f371f',
        'diffEditor.removedLineBackground': '#cf222e1f',
      },
    })
    registered = true
  }

  const isLight = document.documentElement.classList.contains('light')
  monaco.editor.setTheme(isLight ? 'specd-studio-light' : 'specd-studio-dark')
}
