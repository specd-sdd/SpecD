import type {
  ChangeDetailDto,
  ChangeSummaryDto,
  ProjectDto,
  ProjectStatusDto,
  ValidateResultDto,
} from '@specd/client'
import * as React from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../components/ui/resizable.js'
import {
  ChangeLifecycleConfirmDialog,
  type LifecycleConfirmKind,
} from '../change/ChangeLifecycleConfirmDialog.js'
import { ChangeMainView } from '../change/ChangeMainView.js'
import { isShelvedReadOnlySection } from '../change/change-list-section.js'
import { SpecMainView } from '../spec/SpecMainView.js'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import type { ChangeView } from '../tabs/ChangeTabs.js'
import { useChangeArtifact } from '../hooks/use-change-artifact.js'
import { useChangesRead } from '../hooks/use-changes-read.js'
import { useGraphStatus } from '../hooks/use-graph-status.js'
import { useWorkspaceSpecsCollection } from '../hooks/use-workspace-specs-collection.js'
import { useSpecRead } from '../hooks/use-spec-read.js'
import { useArchivedChange } from '../hooks/use-archived-change.js'
import { useInspectorSave } from '../hooks/use-inspector-save.js'
import {
  deriveSpecIdFromFilename,
  useChangePreview,
  showsInspectorDiffTab,
  usesSpecPreview,
} from '../hooks/use-change-preview.js'
import {
  runChangeValidation,
  VALIDATE_INVALIDATION_NOTE,
} from '../hooks/use-change-validate.js'
import { useArtifactOutline } from '../hooks/use-artifact-outline.js'
import { useTabScopedPollKey } from '../hooks/use-tab-scoped-poll-key.js'
import {
  studioOutputLevelFromMessage,
  studioOutputProblems,
  useProjectLogs,
  useStudioOutput,
  useStudioPanelActions,
} from '../hooks/use-studio-panel.js'
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog.js'
import { ValidateConfirmDialog } from '../components/ValidateConfirmDialog.js'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent } from '../components/ui/card.js'
import type { ValidateConfirmScope } from '../hooks/use-change-validate.js'
import { AlertTriangle, Circle, GitPullRequest, Layers, Network, X } from 'lucide-react'
import { ChangesSidebar } from '../sidebar/ChangesSidebar.js'
import { GraphSidebarEntry, WorkspacesSidebar } from '../sidebar/WorkspacesSidebar.js'
import {
  CommandPalette,
  defaultCommandPaletteActions,
} from './CommandPalette.js'
import { StudioLoadingBand } from './StudioLoadingBand.js'
import { StudioTopBar } from './StudioTopBar.js'
import { StatusBar } from './StatusBar.js'
import { ArtifactEditor } from '../editor/ArtifactEditor.js'
import { ArtifactDiffView } from '../editor/ArtifactDiffView.js'
import { ArtifactMarkdownPreview } from '../editor/ArtifactMarkdownPreview.js'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.js'
import { cn } from '../lib/utils.js'

export type ShellLayoutProps = {
  project: ProjectDto | undefined
  projectStatus: ProjectStatusDto | undefined
  connectionLabel: string
  runtimeLabel: string
  refreshKey: number
  changes: {
    active: readonly ChangeSummaryDto[]
    drafts: readonly ChangeSummaryDto[]
    archived: readonly ChangeSummaryDto[]
    discarded: readonly ChangeSummaryDto[]
    error?: Error
  }
  loading: {
    active: boolean
    label?: string
  }
}

type CenterContext =
  | { kind: 'change'; name: string; archived?: boolean }
  | { kind: 'spec'; workspace: string; specPath: string }
  | { kind: 'empty' }

type SelectedArtifact =
  | { kind: 'change'; changeName: string; filename: string }
  | { kind: 'spec'; workspace: string; specPath: string; filename: string }

export function ShellLayout({
  project,
  projectStatus,
  connectionLabel,
  runtimeLabel,
  refreshKey,
  changes,
  loading,
}: ShellLayoutProps): React.ReactElement {
  const [centerCtx, setCenterCtx] = React.useState<CenterContext>({ kind: 'empty' })
  const [changeView, setChangeView] = React.useState<ChangeView>('Overview')
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [bottomTab, setBottomTab] = React.useState<'Output' | 'Problems' | 'Logs'>('Output')
  const pollProjectLogs = bottomTab === 'Logs'
  const studioOutput = useStudioOutput()
  const projectLogs = useProjectLogs(refreshKey, pollProjectLogs)
  const { appendOutput, traceAction } = useStudioPanelActions()
  const problems = React.useMemo(
    () => studioOutputProblems(studioOutput),
    [studioOutput],
  )
  const outputEntries = studioOutput
  const [validating, setValidating] = React.useState(false)
  const [selectedArtifact, setSelectedArtifact] = React.useState<SelectedArtifact | undefined>()
  const [inspectorMode, setInspectorMode] = React.useState<
    'raw' | 'preview' | 'diff' | 'metadata' | 'outline'
  >('raw')
  const [dismissedSpecInspectorKey, setDismissedSpecInspectorKey] = React.useState<string | undefined>()
  const [unsavedPrompt, setUnsavedPrompt] = React.useState<
    { readonly onProceed: () => void } | undefined
  >()
  const [validatePrompt, setValidatePrompt] = React.useState<
    ValidateConfirmScope | undefined
  >()
  // Local editor buffer for unsaved edits; reset when artifact selection changes.
  const [editorBuffer, setEditorBuffer] = React.useState<string | undefined>()
  const port = useSpecdDataPort()

  const pushOutput = React.useCallback(
    async (message: string, action = 'studio-ui') => {
      await appendOutput({
        message,
        level: studioOutputLevelFromMessage(message),
        action,
      })
      await traceAction(action, { text: message })
      setBottomTab('Output')
    },
    [appendOutput, traceAction],
  )

  const changeName = centerCtx.kind === 'change' ? centerCtx.name : undefined
  const isArchivedChange = centerCtx.kind === 'change' && centerCtx.archived === true
  const changeListSection = React.useMemo(() => {
    if (!changeName || isArchivedChange) return null
    if (changes.drafts.some((c) => c.name === changeName)) return 'draft' as const
    if (changes.discarded.some((c) => c.name === changeName)) return 'discarded' as const
    if (changes.active.some((c) => c.name === changeName)) return 'active' as const
    return null
  }, [changeName, changes.active, changes.drafts, changes.discarded, isArchivedChange])
  const [lifecycleBusy, setLifecycleBusy] = React.useState(false)
  const [lifecycleConfirm, setLifecycleConfirm] = React.useState<LifecycleConfirmKind | null>(
    null,
  )
  const specWorkspace = centerCtx.kind === 'spec' ? centerCtx.workspace : undefined
  const specPath = centerCtx.kind === 'spec' ? centerCtx.specPath : undefined
  const openSpecKey = specWorkspace && specPath ? `${specWorkspace}:${specPath}` : undefined

  const workspaceSpecs = useWorkspaceSpecsCollection(project?.workspaces ?? [], refreshKey)
  const isOpenActiveChange =
    !isArchivedChange && centerCtx.kind === 'change' && changeListSection === 'active'
  const pollChangeDetail = isOpenActiveChange && (changeView === 'Overview' || changeView === 'Events')
  const detailPollKey = useTabScopedPollKey(pollChangeDetail, refreshKey)
  const workflowStatusUnavailable =
    isArchivedChange || changeListSection === 'discarded'
  const changeRead = useChangesRead(isArchivedChange ? undefined : changeName, {
    refreshKey: isOpenActiveChange ? refreshKey : undefined,
    detailRefreshKey: pollChangeDetail ? detailPollKey : undefined,
    listSection: changeListSection,
    pollStatus: !workflowStatusUnavailable,
  })
  const archivedRead = useArchivedChange(isArchivedChange ? changeName : undefined)
  const graphStatus = useGraphStatus(refreshKey)

  const changeArtifactFile =
    selectedArtifact?.kind === 'change' ? selectedArtifact.filename : undefined
  const changeArtifactName =
    selectedArtifact?.kind === 'change' ? selectedArtifact.changeName : undefined
  const changeArtifactSection = isArchivedChange ? 'archived' : changeListSection
  const changeArtifact = useChangeArtifact(
    changeArtifactName,
    changeArtifactFile,
    refreshKey,
    { listSection: changeArtifactSection, poll: isOpenActiveChange },
  )
  const specArtifactFilename =
    selectedArtifact?.kind === 'spec' ? selectedArtifact.filename : undefined
  const specArtifactWs =
    selectedArtifact?.kind === 'spec' ? selectedArtifact.workspace : undefined
  const specArtifactPath =
    selectedArtifact?.kind === 'spec' ? selectedArtifact.specPath : undefined
  const specArtifactRead = useSpecRead(specArtifactWs, specArtifactPath, {
    artifactFilename: specArtifactFilename,
    refreshKey,
  })
  const openSpecRead = useSpecRead(specWorkspace, specPath, {
    refreshKey,
    pollArtifact: false,
    pollContext: false,
  })

  const artifactContent =
    selectedArtifact?.kind === 'change'
      ? changeArtifact.data?.content
      : selectedArtifact?.kind === 'spec'
        ? specArtifactRead.artifact.data?.content
        : undefined

  const artifactOriginalHash =
    selectedArtifact?.kind === 'change' ? changeArtifact.data?.originalHash : undefined

  const artifactError =
    selectedArtifact?.kind === 'change'
      ? changeArtifact.error
      : selectedArtifact?.kind === 'spec'
        ? specArtifactRead.artifact.error
        : undefined

  const artifactLoading =
    selectedArtifact?.kind === 'change'
      ? changeArtifact.isLoading
      : selectedArtifact?.kind === 'spec'
        ? specArtifactRead.artifact.isLoading
        : false

  const artifactSelectionKey =
    selectedArtifact === undefined
      ? ''
      : selectedArtifact.kind === 'change'
        ? `change:${selectedArtifact.changeName}:${selectedArtifact.filename}`
        : `spec:${selectedArtifact.workspace}:${selectedArtifact.specPath}:${selectedArtifact.filename}`

  // Reset only the buffer on selection changes; the selected handler owns the initial inspector mode.
  React.useEffect(() => {
    setEditorBuffer(undefined)
  }, [artifactSelectionKey])

  // Sync buffer only when loaded content matches the current selection (avoids stale races).
  React.useEffect(() => {
    if (!artifactSelectionKey || artifactContent === undefined || artifactLoading) {
      return
    }
    setEditorBuffer(artifactContent)
  }, [artifactSelectionKey, artifactContent, artifactLoading])

  const isShelvedReadOnly = isShelvedReadOnlySection(changeListSection)
  const isOpenChangeArtifact =
    selectedArtifact?.kind === 'change' && !isArchivedChange
  const canEditChangeArtifact = isOpenChangeArtifact && !isShelvedReadOnly
  const artifactFilename = selectedArtifact?.filename
  const usesMergedPreview = Boolean(
    isOpenChangeArtifact && artifactFilename && usesSpecPreview(artifactFilename),
  )

  const isDirty = React.useMemo(() => {
    if (!canEditChangeArtifact || artifactContent === undefined || editorBuffer === undefined) {
      return false
    }
    return editorBuffer !== artifactContent
  }, [canEditChangeArtifact, artifactContent, editorBuffer])

  const previewOverrides = React.useMemo(() => {
    if (!isDirty || !artifactFilename || editorBuffer === undefined) {
      return undefined
    }
    return { [artifactFilename]: editorBuffer }
  }, [isDirty, artifactFilename, editorBuffer])

  const needsSpecPreview =
    usesMergedPreview && (inspectorMode === 'preview' || inspectorMode === 'diff')

  const previewHook = useChangePreview(
    selectedArtifact?.kind === 'change' ? selectedArtifact.changeName : undefined,
    selectedArtifact?.kind === 'change' ? selectedArtifact.filename : undefined,
    {
      enabled: needsSpecPreview,
      artifactOverrides: previewOverrides,
    },
  )

  const saveHook = useInspectorSave(
    selectedArtifact?.kind === 'change' ? selectedArtifact.changeName : undefined,
    selectedArtifact?.kind === 'change' ? selectedArtifact.filename : undefined,
    (dto) => {
      setEditorBuffer(dto.content)
      changeRead.status.refetch()
      if (artifactFilename && deriveSpecIdFromFilename(artifactFilename)) {
        previewHook.refetch()
      }
      void pushOutput(`Saved ${dto.filename}`, 'save-artifact')
    },
  )

  /** Preview: spec/delta paths use spec-preview merged only; proposal/design/tasks use raw buffer. */
  const previewMarkdown = React.useMemo(() => {
    if (usesMergedPreview) {
      return previewHook.data?.merged ?? ''
    }
    return editorBuffer ?? artifactContent ?? ''
  }, [usesMergedPreview, previewHook.data?.merged, editorBuffer, artifactContent])

  const canShowDiff = usesMergedPreview && previewHook.data?.merged !== undefined
  const showDiffTab = !isArchivedChange && showsInspectorDiffTab(artifactFilename)

  const inspectorModes = React.useMemo((): readonly (
    | 'raw'
    | 'preview'
    | 'diff'
    | 'metadata'
    | 'outline'
  )[] => {
    const modes: ('raw' | 'preview' | 'diff' | 'metadata' | 'outline')[] =
      selectedArtifact?.kind === 'spec'
        ? ['preview', 'raw', 'metadata', 'outline']
        : ['raw', 'preview', 'metadata', 'outline']
    if (showDiffTab) {
      modes.splice(2, 0, 'diff')
    }
    return modes
  }, [showDiffTab, selectedArtifact])

  React.useEffect(() => {
    if (inspectorMode === 'diff' && !showDiffTab) {
      setInspectorMode(usesMergedPreview ? 'preview' : 'raw')
    }
  }, [artifactSelectionKey, inspectorMode, showDiffTab, usesMergedPreview])

  const outlineContent = editorBuffer ?? artifactContent
  const canOutline = Boolean(
    selectedArtifact &&
      (selectedArtifact.kind === 'change' ||
        (selectedArtifact.kind === 'spec' && specWorkspace && specPath)),
  )
  const artifactOutline = useArtifactOutline({
    enabled: inspectorMode === 'outline' && canOutline,
    kind:
      selectedArtifact?.kind === 'change'
        ? 'change'
        : selectedArtifact?.kind === 'spec'
          ? 'spec'
          : 'none',
    changeName:
      selectedArtifact?.kind === 'change' ? selectedArtifact.changeName : undefined,
    changeFilename:
      selectedArtifact?.kind === 'change' ? selectedArtifact.filename : undefined,
    workspace: selectedArtifact?.kind === 'spec' ? selectedArtifact.workspace : undefined,
    specPath: selectedArtifact?.kind === 'spec' ? selectedArtifact.specPath : undefined,
    specArtifactFilename:
      selectedArtifact?.kind === 'spec' ? selectedArtifact.filename : undefined,
    content: outlineContent,
    refreshKey: inspectorMode === 'outline' ? refreshKey : undefined,
  })

  const runWithUnsavedGuard = React.useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action()
        return
      }
      setUnsavedPrompt({ onProceed: action })
    },
    [isDirty],
  )

  const closeArtifactPanel = React.useCallback(() => {
    if (openSpecKey) {
      setDismissedSpecInspectorKey(openSpecKey)
    }
    setSelectedArtifact(undefined)
    setEditorBuffer(undefined)
    setInspectorMode('raw')
  }, [openSpecKey])

  const showRightPanel = selectedArtifact !== undefined

  React.useEffect(() => {
    if (centerCtx.kind !== 'spec' || !specWorkspace || !specPath) {
      return
    }
    if (dismissedSpecInspectorKey === openSpecKey) {
      return
    }
    if (
      selectedArtifact?.kind === 'spec' &&
      selectedArtifact.workspace === specWorkspace &&
      selectedArtifact.specPath === specPath
    ) {
      return
    }
    const specMd = (openSpecRead.detail.data?.artifacts ?? []).find((file) => file.filename === 'spec.md')
    if (!specMd) {
      return
    }
    setInspectorMode('preview')
    setSelectedArtifact({
      kind: 'spec',
      workspace: specWorkspace,
      specPath,
      filename: specMd.filename,
    })
  }, [
    centerCtx.kind,
    dismissedSpecInspectorKey,
    openSpecKey,
    openSpecRead.detail.data?.artifacts,
    selectedArtifact,
    specPath,
    specWorkspace,
  ])

  const handleSelectChange = (name: string) => {
    runWithUnsavedGuard(() => {
      setCenterCtx({ kind: 'change', name, archived: false })
      setChangeView('Overview')
      setSelectedArtifact(undefined)
      void pushOutput(`Opened change ${name}`, 'open-change')
    })
  }

  const handleSelectArchivedChange = (name: string) => {
    runWithUnsavedGuard(() => {
      setCenterCtx({ kind: 'change', name, archived: true })
      setChangeView('Overview')
      setSelectedArtifact(undefined)
      void pushOutput(`Opened archived change ${name}`, 'open-change')
    })
  }

  const handleSelectSpec = (workspace: string, path: string) => {
    runWithUnsavedGuard(() => {
      setDismissedSpecInspectorKey(undefined)
      setCenterCtx({ kind: 'spec', workspace, specPath: path })
      setSelectedArtifact(undefined)
      void pushOutput(`Opened spec ${workspace}:${path}`, 'open-spec')
    })
  }

  const handleSelectChangeArtifact = (filename: string) => {
    if (!changeName) return
    runWithUnsavedGuard(() => {
      setInspectorMode('raw')
      setSelectedArtifact({ kind: 'change', changeName, filename })
    })
  }

  const handleSelectSpecArtifact = (filename: string) => {
    if (!specWorkspace || !specPath) return
    setDismissedSpecInspectorKey(undefined)
    setInspectorMode('preview')
    setSelectedArtifact({ kind: 'spec', workspace: specWorkspace, specPath, filename })
  }

  const executeValidate = React.useCallback(async (scope: ValidateConfirmScope) => {
    const target = changeName ?? changes.active[0]?.name
    if (!target) {
      await appendOutput({
        message: 'Select a change or create one before validating.',
        level: 'error',
        action: 'validate',
      })
      setBottomTab('Problems')
      return
    }
    if (isArchivedChange) {
      await appendOutput({
        message: 'Archived changes are read-only; validation is disabled.',
        level: 'error',
        action: 'validate',
      })
      setBottomTab('Problems')
      return
    }
    setValidating(true)
    try {
      const openFilename =
        scope === 'artifact' &&
        selectedArtifact?.kind === 'change' &&
        selectedArtifact.changeName === target
          ? selectedArtifact.filename
          : undefined
      const result: ValidateResultDto = await runChangeValidation(port, target, {
        ...(openFilename !== undefined ? { filename: openFilename } : {}),
      })
      const scopeLabel =
        openFilename !== undefined ? `${target} (${openFilename})` : `${target} (all specs)`
      const lines: string[] = [
        result.passed
          ? `Validation passed for ${scopeLabel}`
          : `Validation failed for ${scopeLabel}`,
        ...(result.failures ?? []).map((f) => `✗ ${f.message}${f.path ? ` (${f.path})` : ''}`),
        ...(result.warnings ?? []).map((w) => `⚠ ${w}`),
        VALIDATE_INVALIDATION_NOTE,
      ]
      for (const line of lines) {
        await appendOutput({
          message: line,
          level: studioOutputLevelFromMessage(line),
          action: 'validate',
        })
      }
      await traceAction('validate', { scope: scopeLabel, passed: result.passed })
      setBottomTab(
        lines.some((l) => l.startsWith('✗') || l.startsWith('⚠')) ? 'Problems' : 'Output',
      )
      changeRead.status.refetch()
      if (openFilename === undefined) {
        changeRead.detail.refetch()
      }
    } catch (err) {
      await appendOutput({
        message: `✗ ${err instanceof Error ? err.message : String(err)}`,
        level: 'error',
        action: 'validate',
      })
      await traceAction('validate', { error: true })
      setBottomTab('Problems')
    } finally {
      setValidating(false)
    }
  }, [
    port,
    changeName,
    changes.active,
    changeRead.status,
    changeRead.detail,
    archivedRead.data,
    isArchivedChange,
    selectedArtifact,
    appendOutput,
    traceAction,
  ])

  const requestValidate = React.useCallback(
    (scope: ValidateConfirmScope) => {
      const target = changeName ?? changes.active[0]?.name
      if (!target) {
        void appendOutput({
          message: 'Select a change or create one before validating.',
          level: 'error',
          action: 'validate',
        }).then(() => {
          setBottomTab('Problems')
        })
        return
      }
      if (isArchivedChange) {
        void appendOutput({
          message: 'Archived changes are read-only; validation is disabled.',
          level: 'error',
          action: 'validate',
        }).then(() => {
          setBottomTab('Problems')
        })
        return
      }
      if (isShelvedReadOnly) {
        void appendOutput({
          message: 'Drafted and discarded changes are read-only; validation is disabled.',
          level: 'error',
          action: 'validate',
        }).then(() => {
          setBottomTab('Problems')
        })
        return
      }
      setValidatePrompt(scope)
    },
    [changeName, changes.active, isArchivedChange, isShelvedReadOnly, appendOutput],
  )

  const paletteActions = React.useMemo(
    () =>
      defaultCommandPaletteActions({
        onFocusChanges: () => {
          if (centerCtx.kind !== 'change') {
            setCenterCtx({ kind: 'empty' })
          }
        },
        onFocusWorkspaces: () => {
          if (centerCtx.kind !== 'spec') {
            setCenterCtx({ kind: 'empty' })
          }
        },
        onValidateAll: () => requestValidate('all'),
        onNewChange: () => {
          void pushOutput('New change — wire create dialog (coming soon)', 'new-change')
        },
      }),
    [requestValidate, centerCtx.kind, pushOutput],
  )

  const activeDetail = isArchivedChange ? archivedRead : changeRead.detail
  const detailLoading = activeDetail.isLoading
  const centerLoading = centerCtx.kind === 'change' && changeName && detailLoading

  const validationSummary = React.useMemo(() => {
    if (validating) return 'validating'
    if (problems.some((e) => e.message.startsWith('✗'))) return 'errors'
    if (problems.some((e) => e.message.startsWith('⚠'))) return 'warnings'
    if (problems.length > 0) return 'passed'
    return 'idle'
  }, [problems, validating])

  const refetchOpenChange = React.useCallback(() => {
    if (!isArchivedChange) {
      changeRead.detail.refetch()
      changeRead.status.refetch()
    }
  }, [changeRead.detail, changeRead.status, isArchivedChange])

  const executeLifecycleConfirm = React.useCallback(() => {
    if (!changeName || lifecycleConfirm === null) return

    const actionByKind: Record<
      LifecycleConfirmKind,
      { run: () => Promise<ChangeDetailDto>; outputAction: string }
    > = {
      draft: { run: () => port.draftChange(changeName), outputAction: 'draft-change' },
      restore: { run: () => port.restoreChange(changeName), outputAction: 'restore-change' },
      discard: {
        run: () => port.discardChange(changeName),
        outputAction: 'discard-change',
      },
      archive: { run: () => port.archiveChange(changeName), outputAction: 'archive-change' },
    }

    const { run, outputAction } = actionByKind[lifecycleConfirm]
    setLifecycleConfirm(null)
    setLifecycleBusy(true)
    void (async () => {
      try {
        await run()
        refetchOpenChange()
        void pushOutput(`Lifecycle action completed for ${changeName}`, outputAction)
      } catch (err: unknown) {
        const text = err instanceof Error ? err.message : String(err)
        void pushOutput(`✗ ${text}`, outputAction)
      } finally {
        setLifecycleBusy(false)
      }
    })()
  }, [changeListSection, changeName, lifecycleConfirm, port, pushOutput, refetchOpenChange])

  const handleShelfToDrafts = React.useCallback(() => {
    if (!changeName) return
    setLifecycleConfirm('draft')
  }, [changeName])

  const handleRestoreToActive = React.useCallback(() => {
    if (!changeName) return
    setLifecycleConfirm('restore')
  }, [changeName])

  const handleDiscardChange = React.useCallback(() => {
    if (!changeName) return
    setLifecycleConfirm('discard')
  }, [changeName])

  const handleArchiveChange = React.useCallback(() => {
    if (!changeName) return
    setLifecycleConfirm('archive')
  }, [changeName])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="studio-shell">
      <StudioTopBar
        onOpenCommandPalette={() => setCommandOpen(true)}
        onNewChange={() => {
          void pushOutput('New change — coming soon', 'new-change')
        }}
      />

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        actions={paletteActions}
      />

      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        {/* ── Sidebar ── */}
        <ResizablePanel defaultSize={18} minSize={16} maxSize={30} className="studio-panel border-r border-border">
          <div className="studio-sidebar-stack min-w-0">
            <ResizablePanelGroup direction="vertical" className="min-h-0 flex-1">
              <ResizablePanel defaultSize={40} minSize={20} className="studio-sidebar-pane min-h-0 min-w-0">
                <div className="studio-panel-header flex items-center gap-2">
                  <GitPullRequest className="h-3 w-3 text-studio-success" />
                  <span>Changes</span>
                </div>
                <div className="studio-scrollbar flex-1 min-h-0 overflow-y-auto">
                  <ChangesSidebar
                    active={changes.active}
                    drafts={changes.drafts}
                    archived={changes.archived}
                    discarded={changes.discarded}
                    error={changes.error}
                    selected={changeName}
                    onSelect={handleSelectChange}
                    onSelectArchived={handleSelectArchivedChange}
                  />
                </div>
              </ResizablePanel>

              <ResizableHandle className="h-2 w-full bg-transparent after:h-2 data-[panel-group-direction=vertical]:h-2 data-[panel-group-direction=vertical]:bg-transparent" />

              <ResizablePanel defaultSize={60} minSize={20} className="studio-sidebar-pane min-h-0 min-w-0">
                <div className="studio-panel-header flex items-center gap-2">
                  <Layers className="h-3 w-3 text-studio-info" />
                  <span>Workspaces - Specs</span>
                </div>
                <div className="studio-scrollbar flex-1 min-h-0 overflow-y-auto">
                  <WorkspacesSidebar
                    entries={workspaceSpecs.data ?? []}
                    loading={workspaceSpecs.isLoading}
                    selectedWorkspace={specWorkspace}
                    selectedSpecPath={specPath}
                    onSelectSpec={handleSelectSpec}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>

            <section className="studio-sidebar-pane">
              <div className="studio-panel-header flex items-center gap-2">
                <Network className="h-3 w-3 text-studio-warning" />
                <span>Graph</span>
              </div>
              <div className="p-2">
                <GraphSidebarEntry
                  graphStatus={graphStatus.data}
                  onOpenGraph={() => {
                    setBottomTab('Logs')
                    projectLogs.refetch()
                  }}
                />
              </div>
            </section>
          </div>
        </ResizablePanel>

        <ResizableHandle className="studio-resize-handle w-px" />

        {/* ── Center + right ── */}
        <ResizablePanel minSize={40} className="flex min-w-0 flex-col">
          <ResizablePanelGroup direction="vertical" className="min-h-0 flex-1">
            {/* main content row */}
            <ResizablePanel defaultSize={78} minSize={30} className="flex min-h-0 flex-col">
              <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
                {/* center content */}
                <ResizablePanel minSize={20} className="studio-scrollbar flex min-w-0 flex-col">
                  {centerCtx.kind === 'change' ? (
                    <ChangeMainView
                      changeName={changeName}
                      isArchived={isArchivedChange}
                      changeView={changeView}
                      onChangeView={setChangeView}
                      detail={activeDetail.data}
                      detailError={activeDetail.error}
                      detailLoading={detailLoading}
                      status={workflowStatusUnavailable ? undefined : changeRead.status.data}
                      statusError={
                        workflowStatusUnavailable ? undefined : changeRead.status.error
                      }
                      statusLoading={
                        workflowStatusUnavailable ? false : changeRead.status.isLoading
                      }
                      refreshKey={refreshKey}
                      onSelectArtifact={handleSelectChangeArtifact}
                      selectedArtifactFile={
                        selectedArtifact?.kind === 'change'
                          ? selectedArtifact.filename
                          : undefined
                      }
                      onValidateAll={
                        isArchivedChange || isShelvedReadOnly
                          ? undefined
                          : () => requestValidate('all')
                      }
                      onDescriptionSaved={(detail) => {
                        if (!isArchivedChange) {
                          changeRead.detail.refetch()
                          void pushOutput(
                            `Updated description for change "${detail.name}"`,
                            'save-description',
                          )
                        }
                      }}
                      onScopeSaved={(detail) => {
                        if (!isArchivedChange) {
                          changeRead.detail.refetch()
                          void pushOutput(
                            `Updated spec scope & dependencies for "${detail.name}" (${detail.specIds.length} spec(s))`,
                            'save-scope',
                          )
                        }
                      }}
                      onScopeInvalidated={() => {
                        if (!isArchivedChange) {
                          changeRead.detail.refetch()
                          void pushOutput(
                            '⚠ Spec scope updated — approvals may have been invalidated. Review workflow and artifacts.',
                            'scope-invalidate',
                          )
                        }
                      }}
                      onInvalidationPolicySaved={(detail) => {
                        if (!isArchivedChange) {
                          changeRead.detail.refetch()
                          void pushOutput(
                            `Updated invalidation policy for "${detail.name}" → ${detail.invalidationPolicy ?? 'downstream'}`,
                            'save-invalidation-policy',
                          )
                        }
                      }}
                      changeListSection={changeListSection}
                      lifecycleBusy={lifecycleBusy}
                      onShelfToDrafts={
                        isArchivedChange ? undefined : handleShelfToDrafts
                      }
                      onRestoreToActive={
                        isArchivedChange ? undefined : handleRestoreToActive
                      }
                      onDiscardChange={
                        isArchivedChange ? undefined : handleDiscardChange
                      }
                      onArchiveChange={
                        isArchivedChange ? undefined : handleArchiveChange
                      }
                    />
                  ) : centerCtx.kind === 'spec' ? (
                    <SpecMainView
                      workspace={specWorkspace}
                      specPath={specPath}
                      refreshKey={refreshKey}
                      onSelectArtifact={handleSelectSpecArtifact}
                      selectedArtifactFile={
                        selectedArtifact?.kind === 'spec'
                          ? selectedArtifact.filename
                          : undefined
                      }
                    />
                  ) : (
                    <EmptyCenter />
                  )}
                </ResizablePanel>

                {/* right artifact inspector panel */}
                {showRightPanel ? (
                  <>
                    <ResizableHandle className="studio-resize-handle w-px" />
                    <ResizablePanel
                      defaultSize={50}
                      minSize={20}
                      maxSize={80}
                      className="studio-panel flex flex-col border-l border-border"
                    >
                      {/* inspector header: filename + close */}
                      <div className="studio-panel-header flex shrink-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-mono text-xs">
                          {selectedArtifact?.filename}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Close artifact"
                          onClick={() => runWithUnsavedGuard(closeArtifactPanel)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <Tabs
                        value={inspectorMode}
                        onValueChange={(v) => setInspectorMode(v as any)}
                        className="flex min-h-0 flex-1 flex-col"
                      >
                        {/* mode tabs */}
                        <TabsList className="shrink-0">
                          {inspectorModes.map((mode) => {
                            const disabled = mode === 'outline' && !canOutline
                            return (
                              <TabsTrigger
                                key={mode}
                                value={mode}
                                disabled={disabled}
                                className="h-auto bg-transparent shadow-none"
                              >
                                {mode === 'raw'
                                  ? canEditChangeArtifact
                                    ? artifactFilename?.startsWith('deltas/')
                                      ? 'Delta'
                                      : 'Edit'
                                    : isOpenChangeArtifact
                                      ? 'View'
                                      : 'Raw'
                                  : mode === 'preview'
                                    ? 'Preview'
                                    : mode === 'diff'
                                      ? 'Diff'
                                      : mode === 'metadata'
                                        ? 'Metadata'
                                        : 'Outline'}
                              </TabsTrigger>
                            )
                          })}

                          {/* Save + Validate — only for change artifacts */}
                          {canEditChangeArtifact ? (
                            <div className="ml-auto flex items-center gap-[5px]">
                              {isDirty ? (
                                <span title="Unsaved changes">
                                  <Circle
                                    className="!size-2 fill-amber-400 text-amber-400"
                                    aria-label="Unsaved changes"
                                  />
                                </span>
                              ) : null}
                              {saveHook.conflict ? (
                                <span className="text-[10px] text-destructive">conflict</span>
                              ) : null}
                              <button
                                type="button"
                                disabled={saveHook.isSaving || !artifactOriginalHash}
                                className="m-[5px] rounded px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
                                onClick={() => {
                                  if (!editorBuffer || !artifactOriginalHash) return
                                  void saveHook.save(editorBuffer, artifactOriginalHash)
                                }}
                              >
                                {saveHook.isSaving ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                type="button"
                                data-testid="studio-validate-artifact"
                                disabled={validating}
                                className="m-[5px] rounded px-2 py-0.5 text-[10px] font-medium bg-muted/40 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                                onClick={() => requestValidate('artifact')}
                              >
                                Validate
                              </button>
                            </div>
                          ) : null}
                        </TabsList>

                        {/* 409 conflict banner */}
                        {saveHook.conflict ? (
                          <Alert variant="destructive" className="rounded-none border-x-0 border-b p-2 shadow-none">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle className="text-[11px] font-bold uppercase tracking-wider">Save Conflict</AlertTitle>
                            <AlertDescription className="text-xs">
                              Another process modified this file.{' '}
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-xs text-destructive underline"
                                onClick={() => {
                                  if (!editorBuffer || !artifactOriginalHash) return
                                  void saveHook.forceOverwrite(editorBuffer, artifactOriginalHash)
                                }}
                              >
                                Force overwrite
                              </Button>{' '}
                              or{' '}
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-xs text-destructive underline"
                                onClick={saveHook.clearConflict}
                              >
                                discard
                              </Button>
                              .
                            </AlertDescription>
                          </Alert>
                        ) : null}

                        {/* inspector body */}
                        <TabsContent
                          value={inspectorMode}
                          className="m-0 min-h-0 flex-1 focus-visible:ring-0"
                        >
                          {inspectorMode === 'metadata' ? (
                            <ArtifactMetadataPanel
                              filename={selectedArtifact?.filename}
                              kind={selectedArtifact?.kind ?? 'spec'}
                              originalHash={artifactOriginalHash}
                              content={editorBuffer ?? artifactContent ?? ''}
                            />
                          ) : inspectorMode === 'outline' ? (
                            artifactOutline.isLoading && !artifactOutline.data?.length ? (
                              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                Loading outline…
                              </div>
                            ) : artifactOutline.error ? (
                              <div className="flex h-full items-center justify-center p-4 text-xs text-destructive">
                                {artifactOutline.error.message}
                              </div>
                            ) : (
                              <pre className="studio-scrollbar h-full overflow-auto p-3 font-mono text-xs text-foreground/90">
                                {artifactOutline.data?.length
                                  ? JSON.stringify(artifactOutline.data, null, 2)
                                  : 'No outline for this artifact.'}
                              </pre>
                            )
                          ) : inspectorMode === 'diff' ? (
                            usesMergedPreview && previewHook.isLoading && !previewHook.data ? (
                              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                Loading spec-preview…
                              </div>
                            ) : previewHook.error && !previewHook.data ? (
                              <div className="flex h-full items-center justify-center p-4 text-xs text-destructive">
                                {previewHook.error.message}
                              </div>
                            ) : canShowDiff ? (
                              <ArtifactDiffView
                                filename={selectedArtifact?.filename}
                                original={previewHook.data!.base ?? ''}
                                modified={previewHook.data!.merged}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
                                Diff is available for spec deltas in a change (base vs merged).
                              </div>
                            )
                          ) : inspectorMode === 'preview' ? (
                            usesMergedPreview && previewHook.isLoading && !previewHook.data ? (
                              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                Loading spec-preview…
                              </div>
                            ) : previewHook.error && usesMergedPreview && !previewHook.data ? (
                              <div className="flex h-full items-center justify-center p-4 text-xs text-destructive">
                                {previewHook.error.message}
                              </div>
                            ) : usesMergedPreview && !previewHook.data?.merged ? (
                              <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
                                No merged preview for this artifact.
                              </div>
                            ) : (
                              <ArtifactMarkdownPreview content={previewMarkdown} />
                            )
                          ) : artifactError ? (
                            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-destructive">
                              {artifactError.message}
                            </div>
                          ) : artifactLoading ? (
                            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                              Loading…
                            </div>
                          ) : (
                            <ArtifactEditor
                              key={artifactSelectionKey}
                              filename={selectedArtifact?.filename}
                              value={editorBuffer ?? ''}
                              readOnly={!canEditChangeArtifact}
                              onChange={canEditChangeArtifact ? setEditorBuffer : undefined}
                            />
                          )}
                        </TabsContent>
                      </Tabs>
                    </ResizablePanel>
                  </>
                ) : null}
              </ResizablePanelGroup>
            </ResizablePanel>

            <ResizableHandle className="studio-resize-handle h-px" />

            {/* bottom panel */}
            <ResizablePanel defaultSize={22} minSize={12} className="studio-panel">
              <Tabs
                value={bottomTab}
                onValueChange={(v) => setBottomTab(v as any)}
                className="flex min-h-0 flex-1 flex-col"
              >
                <TabsList className="shrink-0">
                  {(['Output', 'Problems', 'Logs'] as const).map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="h-auto bg-transparent shadow-none"
                    >
                      {tab}
                    </TabsTrigger>
                  ))}
                  {validating ? (
                    <span className="px-2 text-xs text-muted-foreground"> · validating…</span>
                  ) : null}
                </TabsList>
                <TabsContent
                  value={bottomTab}
                  className="m-0 min-h-0 flex-1 overflow-hidden focus-visible:ring-0"
                >
                  <div className="studio-scrollbar h-full overflow-y-auto">
                    <div className="p-2 font-mono text-xs">
                      <BottomLines
                        entries={
                          bottomTab === 'Problems'
                            ? problems
                            : bottomTab === 'Output'
                              ? outputEntries
                              : undefined
                        }
                        lines={bottomTab === 'Logs' ? projectLogs.lines : undefined}
                        emptyLabel={
                          bottomTab === 'Problems'
                            ? 'Warnings and errors from studio actions appear here.'
                            : bottomTab === 'Output'
                              ? 'Results of saves, validation, and other studio actions appear here.'
                              : 'Recent specd log entries appear here.'
                        }
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      <StudioLoadingBand
        active={loading.active || Boolean(centerLoading) || validating}
        label={
          centerLoading && changeName ? `Loading ${changeName}…` : loading.label
        }
      />
      <StatusBar
        project={project}
        projectStatus={projectStatus}
        connectionLabel={connectionLabel}
        runtimeLabel={runtimeLabel}
        validationSummary={validationSummary}
      />

      <UnsavedChangesDialog
        open={unsavedPrompt !== undefined}
        saving={saveHook.isSaving}
        onCancel={() => setUnsavedPrompt(undefined)}
        onDiscard={() => {
          const proceed = unsavedPrompt?.onProceed
          setUnsavedPrompt(undefined)
          proceed?.()
        }}
        onSave={() => {
          if (!editorBuffer || !artifactOriginalHash) return
          void saveHook.save(editorBuffer, artifactOriginalHash).then((saved) => {
            if (!saved) return
            const proceed = unsavedPrompt?.onProceed
            setUnsavedPrompt(undefined)
            proceed?.()
          })
        }}
      />

      <ValidateConfirmDialog
        open={validatePrompt !== undefined}
        scope={validatePrompt ?? 'all'}
        changeName={changeName ?? changes.active[0]?.name ?? ''}
        filename={
          validatePrompt === 'artifact' &&
          selectedArtifact?.kind === 'change'
            ? selectedArtifact.filename
            : undefined
        }
        validating={validating}
        onCancel={() => setValidatePrompt(undefined)}
        onContinue={() => {
          const scope = validatePrompt ?? 'all'
          setValidatePrompt(undefined)
          void executeValidate(scope)
        }}
      />

      <ChangeLifecycleConfirmDialog
        open={lifecycleConfirm !== null}
        kind={lifecycleConfirm}
        changeName={changeName ?? ''}
        busy={lifecycleBusy}
        onCancel={() => setLifecycleConfirm(null)}
        onConfirm={executeLifecycleConfirm}
      />
    </div>
  )
}

function EmptyCenter(): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardContent className="px-6 py-8 text-center">
          <div className="mb-3 inline-flex rounded-md border border-border bg-panel-header px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Workspace Ready
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-[0.12em] text-foreground">
            Select a change or spec
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Use the left sidebar to open an active change, inspect archived work, or browse workspace
            specs and their artifacts.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function ArtifactMetadataPanel({
  filename,
  kind,
  originalHash,
  content,
}: {
  filename: string | undefined
  kind: 'change' | 'spec'
  originalHash: string | undefined
  content: string
}): React.ReactElement {
  const ext = filename?.split('.').pop() ?? ''
  const language = ext === 'yaml' || ext === 'yml' ? 'YAML' : 'Markdown'
  const rows: { label: string; value: string }[] = [
    { label: 'File', value: filename ?? '—' },
    { label: 'Type', value: kind === 'change' ? 'Change artifact' : 'Spec artifact' },
    { label: 'Language', value: language },
    { label: 'Access', value: kind === 'change' ? 'Read / write' : 'Read only' },
    ...(originalHash ? [{ label: 'Hash', value: originalHash.slice(0, 12) + '…' }] : []),
  ]
  const isMetadataFile =
    filename != null &&
    (/metadata\.(ya?ml)$/i.test(filename) || filename.includes('/metadata/'))

  return (
    <div className="studio-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
      <dl className="shrink-0 space-y-3 p-4">
        {rows.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {isMetadataFile && content ? (
        <pre className="min-h-0 flex-1 border-t border-border p-3 font-mono text-xs text-foreground/90">
          {content}
        </pre>
      ) : null}
    </div>
  )
}

function lineTone(message: string): string {
  if (message.startsWith('✗')) {
    return 'text-destructive'
  }
  if (message.startsWith('⚠')) {
    return 'text-amber-400'
  }
  return 'text-foreground'
}

function BottomLines({
  entries,
  lines,
  emptyLabel,
}: {
  entries?: readonly { readonly id: string; readonly message: string }[]
  lines?: readonly string[]
  emptyLabel: string
}): React.ReactElement {
  const rowCount = entries?.length ?? lines?.length ?? 0
  if (rowCount === 0) {
    return (
      <div className="rounded-md border border-border/60 bg-background/30 px-3 py-2 text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  if (entries !== undefined && entries.length > 0) {
    return (
      <ul className="space-y-1">
        {entries.map((entry) => (
          <li key={entry.id} className={lineTone(entry.message)}>
            {entry.message}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className="space-y-1">
      {(lines ?? []).map((line, index) => (
        <li key={`log-${index}`} className={lineTone(line)}>
          {line}
        </li>
      ))}
    </ul>
  )
}
