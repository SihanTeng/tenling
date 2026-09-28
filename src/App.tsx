import { listen } from '@tauri-apps/api/event';
import type { Editor } from '@tiptap/react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import welcomeMarkdown from './assets/welcome.md?raw';
import { FindReplaceOverlay } from './components/Editor/FindReplaceOverlay';
import { MarkdownEditor } from './components/Editor/MarkdownEditor';
import { SlashMenuOverlay } from './components/Editor/SlashMenuOverlay';
import { EmptyState } from './components/EmptyState';
import { MenuBar } from './components/MenuBar';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { confirmDiscard, useDocumentActions } from './hooks/useDocumentActions';
import { comboFromEvent, hasModifier } from './lib/keybindings';
import { markdownToHtml } from './lib/markdown/io';
import { customChrome } from './lib/platform';
import { shouldRouteSelectAll } from './lib/selectAll';
import { closeWindow, forceQuit } from './lib/tauri/files';
import { applyThemeClass, loadThemePreference, saveThemePreference } from './lib/theme';
import { checkForUpdates } from './lib/updater';
import { useDocumentStore } from './stores/documentStore';
import { commandForCombo } from './stores/keybindingStore';

// Lazy: keeps remotion/@remotion/player out of the main bundle — they are
// only fetched when a presentation is actually opened
const PresentOverlay = lazy(() =>
  import('./components/Present/PresentOverlay').then((m) => ({ default: m.PresentOverlay })),
);

const STARTER_MD = welcomeMarkdown;

export default function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const hasDocument = useDocumentStore((s) => s.hasDocument);
  const contentHtml = useDocumentStore((s) => s.contentHtml);
  const revision = useDocumentStore((s) => s.revision);
  const presentOpen = useDocumentStore((s) => s.presentOpen);
  const setPresentOpen = useDocumentStore((s) => s.setPresentOpen);
  const theme = useDocumentStore((s) => s.theme);
  const setTheme = useDocumentStore((s) => s.setTheme);
  const autoSave = useDocumentStore((s) => s.autoSave);
  const dirty = useDocumentStore((s) => s.dirty);
  const docPath = useDocumentStore((s) => s.path);
  const editTick = useDocumentStore((s) => s.editTick);

  const actions = useDocumentActions(editor);

  const startWithWelcomeDoc = useCallback(() => {
    actions.loadDocument({
      title: 'Untitled',
      markdown: STARTER_MD,
      html: markdownToHtml(STARTER_MD),
      path: null,
    });
  }, [actions]);

  // Theme bootstrap
  useEffect(() => {
    const pref = loadThemePreference();
    setTheme(pref);
    applyThemeClass(pref);
  }, [setTheme]);

  useEffect(() => {
    applyThemeClass(theme);
    saveThemePreference(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (theme === 'system') applyThemeClass('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  // Window title sync
  const { syncTitle } = actions;
  useEffect(() => {
    void syncTitle();
  }, [syncTitle]);

  // Recent files
  useEffect(() => {
    void actions.refreshRecent();
  }, [actions]);

  // Restore last-opened file / workspace from the previous session
  const { restoreSession } = actions;
  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  // Silent update check on launch (manual checks come from the File menu)
  useEffect(() => {
    void checkForUpdates();
  }, []);

  // External-change detection: poll the file's mtime whenever the window
  // regains focus (clean docs reload, dirty docs ask first)
  const { checkExternalChange } = actions;
  useEffect(() => {
    const onFocus = () => void checkExternalChange();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkExternalChange]);

  // Unsaved-changes guard for window close / Cmd+Q: Rust intercepts the
  // close and emits here; the frontend confirms, then closes or quits
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<string>('close-requested', (event) => {
      void (async () => {
        if (useDocumentStore.getState().dirty && !(await confirmDiscard())) return;
        if (event.payload === 'quit') {
          await forceQuit();
        } else {
          await closeWindow();
        }
      })();
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        /* not in Tauri */
      });
    return () => unlisten?.();
  }, []);

  // Auto-save: write 2s after typing stops (every inactivity pause), only
  // for files that already have a path (untitled docs wait for save-as).
  // A save in flight skips scheduling; isSaving flipping back re-runs the
  // effect, so edits that landed during the write still get their own save.
  const { saveDocument } = actions;
  const isSaving = useDocumentStore((s) => s.isSaving);
  // biome-ignore lint/correctness/useExhaustiveDependencies: editTick is the debounce trigger — each keystroke resets the timer
  useEffect(() => {
    if (!autoSave || !dirty || !docPath || isSaving) return;
    const timer = setTimeout(() => {
      void saveDocument();
    }, 2000);
    return () => clearTimeout(timer);
  }, [autoSave, dirty, docPath, editTick, isSaving, saveDocument]);

  // Menu commands — shared by the native macOS menu (via the Rust 'menu'
  // event) and the in-window MenuBar used on Linux/Windows
  const handleMenuCommand = useCallback(
    (id: string) => {
      switch (id) {
        case 'file_new':
          if (!useDocumentStore.getState().hasDocument) {
            startWithWelcomeDoc();
          } else {
            void actions.newDocument();
          }
          break;
        case 'file_open':
          void actions.openDocument();
          break;
        case 'file_save':
          void actions.saveDocument();
          break;
        case 'file_save_as':
          void actions.saveDocumentAs();
          break;
        case 'file_export_html':
          void actions.exportHtml();
          break;
        case 'file_export_docx':
          void actions.exportDocx();
          break;
        case 'file_export_pdf':
          void actions.exportPdf();
          break;
        case 'edit_find':
          if (useDocumentStore.getState().hasDocument) setFindOpen(true);
          break;
        case 'edit_copy_html':
          void actions.copyHtml();
          break;
        case 'view_present':
          actions.present();
          break;
        case 'app_shortcuts':
          setShortcutsOpen(true);
          break;
        case 'app_check_updates':
          void checkForUpdates(true);
          break;
      }
    },
    [actions, startWithWelcomeDoc],
  );

  // Native menu events from Rust (macOS only)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<string>('menu', (event) => handleMenuCommand(event.payload))
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        /* not in Tauri */
      });
    return () => unlisten?.();
  }, [handleMenuCommand]);

  // Global shortcuts, driven by the rebindable registry (keybindingStore).
  // On macOS the native menu's own accelerators still work alongside these.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore key auto-repeat: holding a shortcut would re-fire the command
      // on every repeat tick (a held Ctrl+S stacked one save dialog per tick).
      if (e.repeat) return;
      const combo = comboFromEvent(e);
      if (!combo || !hasModifier(combo)) return;
      const commandId = commandForCombo(combo);
      if (!commandId) return;
      e.preventDefault();
      handleMenuCommand(commandId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMenuCommand]);

  // Ctrl+A from non-editable UI (chrome, sidebar, buttons) reroutes to the
  // editor's select-all instead of becoming a page-wide selection that
  // would include the document title. Inside the editor ProseMirror does
  // this natively; inside inputs the field keeps its own local select-all.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'a' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey)
        return;
      if (!shouldRouteSelectAll(e.target) || !editor) return;
      e.preventDefault();
      editor.chain().focus().selectAll().run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  const onReady = useCallback((ed: Editor) => {
    setEditor(ed);
  }, []);

  const showEmpty = !hasDocument;

  return (
    <div
      className={`app-shell flex h-full w-full overflow-hidden bg-[var(--color-bg)] print:block print:h-auto print:overflow-visible ${customChrome ? 'pt-8 print:pt-0' : ''}`}
    >
      <MenuBar editor={editor} onCommand={handleMenuCommand} />
      <Sidebar
        editor={editor}
        onOpenRecent={actions.openRecent}
        onHideRecent={(path) => void actions.hideRecent(path)}
      />

      <div className="flex min-w-0 flex-1 flex-col print:block print:h-auto print:overflow-visible">
        <Toolbar editor={editor} onCommand={handleMenuCommand} />

        <main
          className="relative min-h-0 flex-1 print:h-auto print:overflow-visible"
          style={{ background: 'var(--color-editor-bg)' }}
        >
          {showEmpty ? (
            <EmptyState
              onNew={startWithWelcomeDoc}
              onOpen={() => void actions.openDocument()}
              onOpenFolder={() => void actions.openWorkspace()}
            />
          ) : (
            <>
              <MarkdownEditor
                key={revision}
                initialHtml={contentHtml}
                onReady={onReady}
                onRename={(name) => void actions.renameDocument(name)}
              />
              {editor && findOpen ? (
                <FindReplaceOverlay editor={editor} onClose={() => setFindOpen(false)} />
              ) : null}
              {editor ? <SlashMenuOverlay editor={editor} /> : null}
            </>
          )}
        </main>

        <StatusBar />
      </div>

      {presentOpen ? (
        <Suspense fallback={null}>
          <PresentOverlay editor={editor} onClose={() => setPresentOpen(false)} />
        </Suspense>
      ) : null}

      {shortcutsOpen ? <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} /> : null}
    </div>
  );
}
