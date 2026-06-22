import type { Monaco } from '@monaco-editor/react'
import * as React from 'react'
import { onMonacoBeforeMount } from './monaco-studio-theme.js'

type DiffEditorProps = {
  height: string | number
  theme?: string
  language?: string
  original: string
  modified: string
  beforeMount?: (monaco: Monaco) => void
  options?: Record<string, unknown>
}

const DiffEditor = React.lazy(async () => {
  const mod = await import('@monaco-editor/react')
  return { default: mod.DiffEditor as React.ComponentType<DiffEditorProps> }
})

/**
 * Side-by-side diff of base vs merged artifact content (inspector Diff mode).
 */
function ArtifactDiffViewInner({
  filename,
  original,
  modified,
  theme = 'dark',
}: {
  filename?: string
  original: string
  modified: string
  theme?: 'light' | 'dark'
}): React.ReactElement {
  const language =
    filename?.endsWith('.yaml') || filename?.endsWith('.yml') ? 'yaml' : 'markdown'

  const monacoTheme = theme === 'light' ? 'specd-studio-light' : 'specd-studio-dark'

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <React.Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground bg-editor">
            Loading diff…
          </div>
        }
      >
        <DiffEditor
          height="100%"
          theme={monacoTheme}
          language={language}
          original={original}
          modified={modified}
          beforeMount={onMonacoBeforeMount}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            wrappingStrategy: 'advanced',
          }}
        />
      </React.Suspense>
    </div>
  )
}

/** Memoized so parent shell re-renders (global poll) do not remount Monaco diff. */
export const ArtifactDiffView = React.memo(ArtifactDiffViewInner)
