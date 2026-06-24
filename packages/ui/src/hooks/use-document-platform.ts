import * as React from 'react'

/** Reads `data-platform` from the document root (darwin, win32, linux, web). */
export function useDocumentPlatform(): string | undefined {
  const [platform, setPlatform] = React.useState<string | undefined>()

  React.useEffect(() => {
    setPlatform(document.documentElement.dataset.platform)
  }, [])

  return platform
}
