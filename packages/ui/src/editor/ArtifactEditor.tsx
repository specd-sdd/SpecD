import type { Monaco } from '@monaco-editor/react'
import * as React from 'react'
import { onMonacoBeforeMount } from './monaco-studio-theme.js'

type MonacoEditorProps = {
  height: string | number
  theme?: string
  language?: string
  value?: string
  onChange?: (value: string | undefined) => void
  beforeMount?: (monaco: Monaco) => void
  options?: Record<string, unknown>
}

const MonacoEditor = React.lazy(async () => {
  const mod = await import('@monaco-editor/react')
  return { default: mod.default as React.ComponentType<MonacoEditorProps> }
})

export function ArtifactEditor({
  filename,
  value,
  onChange,
  readOnly = false,
}: {
  filename?: string
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
}): React.ReactElement {
  const language =
    filename?.endsWith('.yaml') || filename?.endsWith('.yml') ? 'yaml' : 'markdown'

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ backgroundColor: 'rgb(20, 22, 26)' }}
    >
      {filename ? (
        <div className="border-b border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {filename}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <React.Suspense
          fallback={
            <textarea
              className="h-full w-full resize-none p-2 font-mono text-xs text-foreground outline-none"
              style={{ backgroundColor: 'rgb(20, 22, 26)' }}
              value={value}
              readOnly={readOnly}
              onChange={(e) => onChange?.(e.target.value)}
            />
          }
        >
          <MonacoEditor
            height="100%"
            theme="specd-studio"
            language={language}
            value={value}
            beforeMount={onMonacoBeforeMount}
            onChange={(next: string | undefined) => onChange?.(next ?? '')}
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              scrollBeyondLastLine: false,
              padding: { top: 8 },
              find: { addExtraSpaceOnTop: false },
            }}
          />
        </React.Suspense>
      </div>
    </div>
  )
}
