import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';

export type SidebarMode = 'outline' | 'files';

export interface OutlineItem {
  id: string;
  level: 1 | 2 | 3;
  text: string;
  pos: number;
}

export interface RecentFile {
  path: string;
  name: string;
}

interface DocumentState {
  path: string | null;
  title: string;
  contentMarkdown: string;
  contentHtml: string;
  /** Leading YAML frontmatter block, kept verbatim (delimiters included) and
   *  re-prefixed on save; never rendered in the editor. */
  frontmatter: string | null;
  /** Disk mtime (ms since epoch) as of the last load/save — external-change
   *  detection compares against this on window focus. */
  fileMtime: number | null;
  revision: number;
  /** Bumped on every editor transaction — drives the auto-save debounce and
   *  lets saves detect edits that landed while a write was in flight. */
  editTick: number;
  dirty: boolean;
  hasDocument: boolean;
  wordCount: number;
  charCount: number;
  cursorLine: number;
  outline: OutlineItem[];
  recent: RecentFile[];
  theme: ThemeMode;
  presentOpen: boolean;
  sidebarOpen: boolean;
  sidebarMode: SidebarMode;
  workspace: string | null;
  autoSave: boolean;
  error: string | null;
  isOpening: boolean;
  isSaving: boolean;
  /** Wall-clock ms of the last successful save — StatusBar's "Saved HH:MM". */
  lastSavedAt: number | null;

  setPath: (path: string | null) => void;
  setTitle: (title: string) => void;
  setContentMarkdown: (md: string) => void;
  setFileMtime: (mtime: number | null) => void;
  bumpEditTick: () => void;
  setDirty: (dirty: boolean) => void;
  setHasDocument: (v: boolean) => void;
  setCounts: (words: number, chars: number) => void;
  setCursorLine: (line: number) => void;
  setOutline: (items: OutlineItem[]) => void;
  setRecent: (files: RecentFile[]) => void;
  setTheme: (theme: ThemeMode) => void;
  setPresentOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarMode: (mode: SidebarMode) => void;
  setWorkspace: (workspace: string | null) => void;
  setAutoSave: (autoSave: boolean) => void;
  setError: (error: string | null) => void;
  setIsOpening: (isOpening: boolean) => void;
  setIsSaving: (isSaving: boolean) => void;
  setLastSavedAt: (t: number | null) => void;
  loadDocument: (opts: {
    title?: string;
    markdown?: string;
    html?: string;
    path?: string | null;
    frontmatter?: string | null;
  }) => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  path: null,
  title: 'Untitled',
  contentMarkdown: '',
  contentHtml: '<p></p>',
  frontmatter: null,
  fileMtime: null,
  revision: 0,
  editTick: 0,
  dirty: false,
  hasDocument: false,
  wordCount: 0,
  charCount: 0,
  cursorLine: 1,
  outline: [],
  recent: [],
  theme: 'system',
  presentOpen: false,
  sidebarOpen: !(
    typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1000px)').matches
  ),
  sidebarMode: 'outline',
  workspace: null,
  autoSave:
    typeof window !== 'undefined' && window.localStorage.getItem('tenling-autosave') !== '0',
  error: null,
  isOpening: false,
  isSaving: false,
  lastSavedAt: null,

  setPath: (path) => set({ path }),
  setTitle: (title) => set({ title }),
  setContentMarkdown: (contentMarkdown) => set({ contentMarkdown }),
  setFileMtime: (fileMtime) => set({ fileMtime }),
  bumpEditTick: () => set((s) => ({ editTick: s.editTick + 1 })),
  setDirty: (dirty) => set({ dirty }),
  setHasDocument: (hasDocument) => set({ hasDocument }),
  setCounts: (wordCount, charCount) => set({ wordCount, charCount }),
  setCursorLine: (cursorLine) => set({ cursorLine }),
  setOutline: (outline) => set({ outline }),
  setRecent: (recent) => set({ recent }),
  setTheme: (theme) => set({ theme }),
  setPresentOpen: (presentOpen) => set({ presentOpen }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarMode: (sidebarMode) => set({ sidebarMode }),
  setWorkspace: (workspace) => set({ workspace }),
  setAutoSave: (autoSave) => {
    window.localStorage.setItem('tenling-autosave', autoSave ? '1' : '0');
    set({ autoSave });
  },
  setError: (error) => set({ error }),
  setIsOpening: (isOpening) => set({ isOpening }),
  setIsSaving: (isSaving) => set({ isSaving }),
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
  loadDocument: (opts) =>
    set((s) => ({
      path: opts.path ?? null,
      title: opts.title ?? 'Untitled',
      contentMarkdown: opts.markdown ?? '',
      contentHtml: opts.html ?? '<p></p>',
      frontmatter: opts.frontmatter ?? null,
      fileMtime: null,
      revision: s.revision + 1,
      editTick: 0,
      dirty: false,
      hasDocument: true,
      outline: [],
      wordCount: 0,
      charCount: 0,
      cursorLine: 1,
      error: null,
      lastSavedAt: null,
    })),
}));
