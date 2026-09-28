import { Ellipsis, Search } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { CommandId } from '../lib/keybindings';
import { isMobile } from '../lib/platform';

export function DocumentMenu({
  onCommand,
  hasDocument,
}: {
  onCommand: (id: CommandId) => void;
  hasDocument: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent | KeyboardEvent) => {
      if (!ref.current?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        ref.current.querySelector('summary')?.focus();
      } else if (ref.current.contains(event.target as Node)) return;
      ref.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismiss);
    };
  }, []);

  const commands: { id: CommandId; label: string }[] = [
    { id: 'edit_find', label: 'Find and replace…' },
    { id: 'file_save_as', label: 'Save as…' },
    { id: 'file_export_html', label: 'Export HTML…' },
    { id: 'file_export_docx', label: 'Export Word…' },
    ...(!isMobile ? [{ id: 'file_export_pdf' as const, label: 'Export PDF…' }] : []),
    { id: 'edit_copy_html', label: 'Copy as HTML' },
    { id: 'app_shortcuts', label: 'Keyboard shortcuts' },
  ];

  return (
    <details ref={ref} className="document-menu">
      <summary aria-label="Document actions" title="Document actions" className="tool-button">
        <Ellipsis size={18} />
      </summary>
      <div className="document-menu-panel">
        {commands.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            disabled={!hasDocument && id !== 'app_shortcuts'}
            onClick={() => {
              if (ref.current) ref.current.open = false;
              onCommand(id);
            }}
          >
            {id === 'edit_find' ? <Search size={15} /> : null}
            {label}
          </button>
        ))}
      </div>
    </details>
  );
}
