import { FilePlus, FileText, FolderOpen } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { isMobile } from '../lib/platform';
import { useDocumentStore } from '../stores/documentStore';

const WelcomePlayer = lazy(() =>
  import('../remotion/WelcomePlayer').then((m) => ({ default: m.WelcomePlayer })),
);

interface Props {
  onNew: () => void;
  onOpen: () => void;
  onOpenFolder: () => void;
}

export function EmptyState({ onNew, onOpen, onOpenFolder }: Props) {
  const isOpening = useDocumentStore((s) => s.isOpening);
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className="empty-state flex h-full flex-col items-center justify-center gap-6 px-8">
      <div className="h-[160px] w-[280px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-[var(--shadow-popover)]">
        {reduced ? (
          <div className="empty-state flex h-full flex-col items-center justify-center gap-2">
            <img
              src="/icon.png"
              alt=""
              width={48}
              height={48}
              className="rounded-[12px] shadow-md"
            />
            <span className="text-[15px] font-medium text-[var(--color-ink)]">TenLing</span>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-[var(--color-ink-tertiary)]">
                …
              </div>
            }
          >
            <WelcomePlayer />
          </Suspense>
        )}
      </div>

      <div className="text-center">
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
          Markdown, quietly
        </h1>
        <p className="mt-1 max-w-sm text-[13px] text-[var(--color-ink-secondary)]">
          A simple WYSIWYG editor with present mode. Open a file or folder, or start a new document.
        </p>
      </div>

      <div className="welcome-actions flex items-center gap-2">
        <button
          type="button"
          onClick={onNew}
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-3.5 text-[13px] font-medium text-white hover:brightness-105"
        >
          <FilePlus size={14} strokeWidth={1.75} />
          New Document
        </button>
        <button
          type="button"
          disabled={isOpening}
          onClick={onOpen}
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface)] px-3.5 text-[13px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-hover)] disabled:opacity-40 disabled:pointer-events-none"
        >
          <FileText size={14} strokeWidth={1.75} />
          Open File…
        </button>
        {!isMobile ? (
          <button
            type="button"
            onClick={onOpenFolder}
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-hairline-strong)] bg-[var(--color-surface)] px-3.5 text-[13px] font-medium text-[var(--color-ink)] hover:bg-[var(--color-hover)]"
          >
            <FolderOpen size={14} strokeWidth={1.75} />
            Open Folder…
          </button>
        ) : null}
      </div>
    </div>
  );
}
