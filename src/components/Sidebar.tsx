import type { Editor } from '@tiptap/react';
import { Clock, Folder, ListTree, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useCompactLayout } from '../hooks/useCompactLayout';
import { scrollToPos } from '../lib/outline';
import { isMobile } from '../lib/platform';
import { type OutlineItem, type RecentFile, useDocumentStore } from '../stores/documentStore';
import { FilesPane } from './FilesPane';

interface Props {
  editor: Editor | null;
  onOpenRecent: (path: string) => void;
  onHideRecent: (path: string) => void;
}

export function Sidebar({ editor, onOpenRecent, onHideRecent }: Props) {
  const open = useDocumentStore((s) => s.sidebarOpen);
  const outline = useDocumentStore((s) => s.outline);
  const recent = useDocumentStore((s) => s.recent);
  const mode = useDocumentStore((s) => s.sidebarMode);
  const setMode = useDocumentStore((s) => s.setSidebarMode);

  const compact = useCompactLayout();
  const setOpen = useDocumentStore((s) => s.setSidebarOpen);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (compact) setOpen(false);
  }, [compact, setOpen]);
  useEffect(() => {
    if (!compact || !open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Tab') {
        const buttons = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input, [tabindex="0"]',
          ) ?? [],
        );
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [compact, open, setOpen]);
  if (!open) return null;
  const openRecent = (path: string) => {
    onOpenRecent(path);
    if (compact) setOpen(false);
  };

  return (
    <>
      {compact ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close sidebar"
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
      ) : null}
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: compact layout gives the aside a dialog role */}
      <aside
        ref={panelRef}
        role={compact ? 'dialog' : undefined}
        aria-modal={compact ? true : undefined}
        aria-label="Document sidebar"
        className="app-sidebar flex h-full w-[var(--sidebar-width)] shrink-0 flex-col border-r border-[var(--color-hairline)] backdrop-blur-xl print:hidden"
        style={{ background: 'var(--color-sidebar)' }}
      >
        <div className="flex gap-1 px-3 pt-3">
          <ModeButton
            active={mode === 'outline'}
            onClick={() => setMode('outline')}
            title="Document outline"
          >
            <ListTree size={14} strokeWidth={1.75} />
          </ModeButton>
          {!isMobile ? (
            <ModeButton
              active={mode === 'files'}
              onClick={() => setMode('files')}
              title="Browse files"
            >
              <Folder size={14} strokeWidth={1.75} />
            </ModeButton>
          ) : null}
          {compact ? (
            <button
              type="button"
              className="sidebar-close ml-auto"
              aria-label="Close sidebar"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          ) : null}
        </div>

        {mode === 'files' && !isMobile ? (
          <FilesPane onOpenFile={openRecent} />
        ) : (
          <OutlinePane
            editor={editor}
            outline={outline}
            recent={recent}
            onOpenRecent={openRecent}
            onHideRecent={onHideRecent}
          />
        )}
      </aside>
    </>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] ${
        active
          ? 'bg-[var(--color-hover)] text-[var(--color-ink)]'
          : 'text-[var(--color-ink-tertiary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]'
      }`}
    >
      {children}
    </button>
  );
}

function OutlinePane({
  editor,
  outline,
  recent,
  onOpenRecent,
  onHideRecent,
}: {
  editor: Editor | null;
  outline: OutlineItem[];
  recent: RecentFile[];
  onOpenRecent: (path: string) => void;
  onHideRecent: (path: string) => void;
}) {
  return (
    <>
      <div className="mac-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-3">
        <Section label="Outline" icon={<ListTree size={12} strokeWidth={2} />}>
          {outline.length === 0 ? (
            <EmptyHint>Headings appear here</EmptyHint>
          ) : (
            outline.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (editor) scrollToPos(editor, item.pos);
                  if (window.matchMedia('(max-width: 1000px)').matches)
                    useDocumentStore.getState().setSidebarOpen(false);
                }}
                className="block w-full truncate rounded-[var(--radius-sm)] px-2 py-1 text-left text-[12.5px] text-[var(--color-ink-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
                style={{ paddingLeft: 8 + (item.level - 1) * 12 }}
              >
                {item.text}
              </button>
            ))
          )}
        </Section>
      </div>

      {/* Recent is pinned to the sidebar bottom with its own scroll area */}
      <div className="shrink-0 border-t border-[var(--color-hairline)] px-2 pb-2">
        <div className="mac-scroll max-h-[35vh] overflow-y-auto">
          <Section label="Recent" icon={<Clock size={12} strokeWidth={2} />}>
            {recent.length === 0 ? (
              <EmptyHint>No recent files</EmptyHint>
            ) : (
              recent.map((f) => (
                <div key={f.path} className="group relative">
                  <button
                    type="button"
                    title={f.path}
                    onClick={() => onOpenRecent(f.path)}
                    className="block w-full truncate rounded-[var(--radius-sm)] px-2 py-1 pr-6 text-left text-[12.5px] text-[var(--color-ink-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
                  >
                    {f.name}
                  </button>
                  <button
                    type="button"
                    title={`Hide ${f.name} from recent`}
                    aria-label={`Hide ${f.name} from recent`}
                    onClick={() => onHideRecent(f.path)}
                    className="absolute top-1/2 right-1 -translate-y-1/2 rounded-[var(--radius-sm)] p-0.5 text-[var(--color-ink-tertiary)] opacity-0 hover:bg-[var(--color-active)] hover:text-[var(--color-ink)] group-hover:opacity-100"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </div>
              ))
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--color-ink-tertiary)]">
        {icon}
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-1 text-[12px] text-[var(--color-ink-tertiary)]">{children}</div>;
}
