import type { Monaco } from '@monaco-editor/react'

const THEME_ID = 'specd-studio'

/** Studio Monaco surface — rgb(20, 22, 26) */
export const MONACO_SURFACE_HEX = '#14161a'

let registered = false

/**
 * Registers a Monaco theme with a fixed Studio editor background.
 * Safe to call on every mount; defines the theme once.
 */
export function onMonacoBeforeMount(monaco: Monaco): void {
  if (!registered) {
    monaco.editor.defineTheme(THEME_ID, {
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
    registered = true
  }

  monaco.editor.setTheme(THEME_ID)
}
