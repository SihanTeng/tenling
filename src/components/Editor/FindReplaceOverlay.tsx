import type { Editor } from '@tiptap/react';
import { CaseSensitive, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  clearFind,
  findMatchCount,
  replaceActiveMatch,
  replaceAllMatches,
  scrollToMatch,
  setFindQuery,
  stepMatch,
} from './findReplace';

interface Props {
  editor: Editor;
  onClose: () => void;
}

const inputClass =
  'h-7 min-w-0 rounded-[var(--radius-sm)] bg-transparent px-2 text-[12.5px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-tertiary)]';

const iconButtonClass =
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-ink-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)] disabled:opacity-40 disabled:pointer-events-none';

const textButtonClass =
  'h-6 shrink-0 rounded-[var(--radius-sm)] px-1.5 text-[11.5px] text-[var(--color-ink-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)] disabled:opacity-40 disabled:pointer-events-none';

/** Find & replace overlay (Cmd+F) — Typora-style, docked top-right. */
export function FindReplaceOverlay({ editor, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Re-render on editor transactions so the match counter stays live
  const [, bump] = useReducer((c: number) => c + 1, 0);
  useEffect(() => {
    editor.on('transaction', bump);
    return () => {
      editor.off('transaction', bump);
    };
  }, [editor]);

  // On open: prefill from a single-line selection, focus, select all
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only — reads the selection once when the overlay opens
  useEffect(() => {
    const { from, to, $from } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, ' ');
    if (selected && !selected.includes('\n') && $from.parent.isTextblock) {
      setQuery(selected);
    }
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

  // Live-search as the query/case changes
  useEffect(() => {
    setFindQuery(editor, query, caseSensitive);
    if (query) scrollToMatch(editor);
  }, [editor, query, caseSensitive]);

  const close = () => {
    clearFind(editor);
    onClose();
    editor.commands.focus();
  };

  const onFindKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      stepMatch(editor, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const onReplaceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      replaceActiveMatch(editor, replacement);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const { active, total } = findMatchCount(editor);
  const hasMatches = total > 0;

  return (
    <div className="find-panel absolute right-4 top-2 z-30 flex w-[300px] flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-popover)]">
      <div className="flex items-center gap-1">
        <input
          ref={findInputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onFindKeyDown}
          placeholder="Find"
          spellCheck={false}
          aria-label="Find in document"
          className={`${inputClass} flex-1`}
        />
        <span className="w-12 shrink-0 text-center text-[11px] tabular-nums text-[var(--color-ink-tertiary)]">
          {query ? (hasMatches ? `${active} / ${total}` : '0 / 0') : ''}
        </span>
        <button
          type="button"
          title="Match case"
          aria-pressed={caseSensitive}
          onClick={() => setCaseSensitive(!caseSensitive)}
          className={`${iconButtonClass} ${caseSensitive ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : ''}`}
        >
          <CaseSensitive size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Previous match (⇧Enter)"
          disabled={!hasMatches}
          onClick={() => stepMatch(editor, -1)}
          className={iconButtonClass}
        >
          <ChevronUp size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          title="Next match (Enter)"
          disabled={!hasMatches}
          onClick={() => stepMatch(editor, 1)}
          className={iconButtonClass}
        >
          <ChevronDown size={14} strokeWidth={1.75} />
        </button>
        <button type="button" title="Close (Esc)" onClick={close} className={iconButtonClass}>
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <input
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={onReplaceKeyDown}
          placeholder="Replace"
          spellCheck={false}
          aria-label="Replace with"
          className={`${inputClass} flex-1`}
        />
        <button
          type="button"
          disabled={!hasMatches}
          onClick={() => replaceActiveMatch(editor, replacement)}
          className={textButtonClass}
        >
          Replace
        </button>
        <button
          type="button"
          disabled={!hasMatches}
          onClick={() => replaceAllMatches(editor, replacement)}
          className={textButtonClass}
        >
          All
        </button>
      </div>
    </div>
  );
}
