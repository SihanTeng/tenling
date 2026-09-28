import { openHref } from '../lib/openHref';
import { useDocumentStore } from '../stores/documentStore';

function formatSavedAt(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function StatusBar() {
  const path = useDocumentStore((s) => s.path);
  const hasDocument = useDocumentStore((s) => s.hasDocument);
  const wordCount = useDocumentStore((s) => s.wordCount);
  const charCount = useDocumentStore((s) => s.charCount);
  const cursorLine = useDocumentStore((s) => s.cursorLine);
  const dirty = useDocumentStore((s) => s.dirty);
  const isSaving = useDocumentStore((s) => s.isSaving);
  const lastSavedAt = useDocumentStore((s) => s.lastSavedAt);
  const error = useDocumentStore((s) => s.error);
  const autoSave = useDocumentStore((s) => s.autoSave);
  const setAutoSave = useDocumentStore((s) => s.setAutoSave);

  return (
    <footer
      className="app-status flex h-[var(--status-height)] shrink-0 items-center justify-between border-t border-[var(--color-hairline)] px-3 text-[11px] text-[var(--color-ink-tertiary)] print:hidden"
      style={{ background: 'var(--color-toolbar)' }}
    >
      <div className="flex min-w-0 items-center gap-2 truncate">
        {error ? (
          <span role="alert" title={error} className="status-error text-[var(--color-danger)]">
            {error}
          </span>
        ) : path ? (
          <button
            type="button"
            className="truncate rounded-sm hover:text-[var(--color-ink-secondary)] hover:underline"
            title={`Ctrl+click to reveal in file manager: ${path}`}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey) void openHref(path);
            }}
          >
            {path}
          </button>
        ) : (
          <span className="truncate">{hasDocument ? 'Unsaved document' : 'Ready'}</span>
        )}
        {error ? null : isSaving ? (
          <span className="shrink-0 text-[var(--color-ink-secondary)]">Saving…</span>
        ) : dirty ? (
          <span className="shrink-0 text-[var(--color-ink-secondary)]">Unsaved changes</span>
        ) : path ? (
          <span className="shrink-0">
            {lastSavedAt ? `Saved ${formatSavedAt(lastSavedAt)}` : 'Saved'}
          </span>
        ) : null}
      </div>
      <div className="status-counts flex shrink-0 items-center gap-3 tabular-nums">
        {hasDocument ? <span>Ln {cursorLine}</span> : null}
        <span className="status-words">
          {wordCount} word{wordCount === 1 ? '' : 's'}
        </span>
        <span>
          {charCount} char{charCount === 1 ? '' : 's'}
        </span>
        <span>Markdown</span>
        <button
          type="button"
          title="Auto-save edited files (2s after typing stops)"
          onClick={() => setAutoSave(!autoSave)}
          className={autoSave ? 'text-[var(--color-ink-secondary)]' : undefined}
        >
          Auto-save {autoSave ? 'on' : 'off'}
        </button>
      </div>
    </footer>
  );
}
