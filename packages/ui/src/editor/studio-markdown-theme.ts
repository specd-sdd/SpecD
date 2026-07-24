import * as React from 'react'

/**
 * Reads the active Studio document theme from `document.documentElement` classes.
 *
 * @returns `'light'` when the root element has a `light` class, otherwise `'dark'`
 */
export function useStudioDocumentTheme(): 'light' | 'dark' {
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => readStudioDocumentTheme())

  React.useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setTheme(readStudioDocumentTheme())
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

function readStudioDocumentTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') {
    return 'dark'
  }
  return document.documentElement.classList.contains('light') ? 'light' : 'dark'
}
