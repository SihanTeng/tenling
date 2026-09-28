import { RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { COMMANDS, comboFromEvent, formatCombo, hasModifier } from '../lib/keybindings';
import { commandForCombo, effectiveCombo, useKeybindingStore } from '../stores/keybindingStore';

/**
 * Keyboard shortcut reference ("hints") with click-to-rebind and reset.
 * Opened via Ctrl+/ or View → Keyboard Shortcuts.
 */
export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const overrides = useKeybindingStore((s) => s.overrides);
  const setBinding = useKeybindingStore((s) => s.setBinding);
  const resetBinding = useKeybindingStore((s) => s.resetBinding);
  const resetAll = useKeybindingStore((s) => s.resetAll);
  const [capturingFor, setCapturingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // While rebinding, the next chord (capture phase, so the global
  // dispatcher and the editor never see it) becomes the new binding.
  useEffect(() => {
    if (!capturingFor) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturingFor(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // still holding only modifiers
      if (!hasModifier(combo)) {
        setError('Shortcuts must include Ctrl or Alt.');
        return;
      }
      const owner = commandForCombo(combo);
      if (owner && owner !== capturingFor) {
        setError(`Already assigned to “${COMMANDS.find((c) => c.commandId === owner)?.label}”.`);
        return;
      }
      setBinding(capturingFor, combo);
      setCapturingFor(null);
      setError(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturingFor, setBinding]);

  // Escape closes, except while capturing (where it cancels the rebind)
  useEffect(() => {
    if (capturingFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capturingFor, onClose]);

  const sections = [...new Set(COMMANDS.map((c) => c.section))];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: backdrop click dismisses; Escape is handled globally
    <div
      className="shortcuts-backdrop fixed inset-0 z-[60] flex items-start justify-center bg-black/25 pt-[15vh] print:hidden"
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: stop backdrop dismiss when clicking inside the panel */}
      <div
        className="shortcuts-panel w-[380px] rounded-[var(--radius-lg)] border border-[var(--color-hairline)] p-4"
        style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-popover)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">Keyboard Shortcuts</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                resetAll();
                setError(null);
              }}
              className="rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--color-ink-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
            >
              Reset all
            </button>
            <button
              type="button"
              title="Close"
              onClick={onClose}
              className="rounded-[var(--radius-sm)] p-1 text-[var(--color-ink-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {sections.map((section) => (
          <div key={section} className="mb-2">
            <div className="px-1 pt-1 pb-0.5 text-[11px] font-medium tracking-wide text-[var(--color-ink-tertiary)] uppercase">
              {section}
            </div>
            {COMMANDS.filter((c) => c.section === section).map((c) => {
              const combo = effectiveCombo(c.commandId, overrides);
              const overridden = c.commandId in overrides;
              const capturing = capturingFor === c.commandId;
              return (
                <div
                  key={c.commandId}
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-0.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-ink)]">
                    {c.label}
                  </span>
                  <button
                    type="button"
                    title={capturing ? 'Escape cancels' : 'Click to rebind'}
                    onClick={() => {
                      setCapturingFor(capturing ? null : c.commandId);
                      setError(null);
                    }}
                    className={`min-w-[64px] rounded-[var(--radius-sm)] border px-2 py-0.5 font-mono text-xs ${
                      capturing
                        ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                        : 'border-[var(--color-hairline-strong)] text-[var(--color-ink-secondary)] hover:bg-[var(--color-hover)]'
                    }`}
                  >
                    {capturing ? 'Press keys…' : combo ? formatCombo(combo) : '—'}
                  </button>
                  {overridden ? (
                    <button
                      type="button"
                      title="Reset to default"
                      onClick={() => resetBinding(c.commandId)}
                      className="rounded-[var(--radius-sm)] p-1 text-[var(--color-ink-tertiary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
                    >
                      <RotateCcw size={12} strokeWidth={1.75} />
                    </button>
                  ) : (
                    <span className="w-[20px]" />
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div className="mt-3 border-t border-[var(--color-hairline)] pt-2 text-xs text-[var(--color-ink-tertiary)]">
          {error ?? 'Menus also open with Alt+F, Alt+E, Alt+V.'}
        </div>
      </div>
    </div>
  );
}
