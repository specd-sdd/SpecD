import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders markdown artifact content for inspector Preview mode.
 */
export function ArtifactMarkdownPreview({
  content,
}: {
  content: string
}): React.ReactElement {
  if (!content.trim()) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
        (empty)
      </div>
    )
  }

  return (
    <div className="studio-scrollbar h-full overflow-y-auto p-4">
      <article className="studio-markdown-preview max-w-none text-sm text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </article>
    </div>
  )
}
