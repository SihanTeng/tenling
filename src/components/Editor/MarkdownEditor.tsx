import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import { type Editor, EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { lineAt } from '../../lib/cursor';
import { localizeHtmlImages, needsImageLocalization, pasteImageIntoEditor } from '../../lib/images';
import { htmlToMarkdown, looksLikeMarkdown, markdownToHtml } from '../../lib/markdown/io';
import { filePathAt, openHref } from '../../lib/openHref';
import { buildOutline } from '../../lib/outline';
import { useDocumentStore } from '../../stores/documentStore';
import { DocumentTitle } from './DocumentTitle';
import { createExtensions } from './extensions';

interface Props {
  initialHtml: string;
  onReady?: (editor: Editor) => void;
  onRename?: (name: string) => void;
}

export function MarkdownEditor({ initialHtml, onReady, onRename }: Props) {
  const setDirty = useDocumentStore((s) => s.setDirty);
  const bumpEditTick = useDocumentStore((s) => s.bumpEditTick);
  const setContentMarkdown = useDocumentStore((s) => s.setContentMarkdown);
  const setCounts = useDocumentStore((s) => s.setCounts);
  const setCursorLine = useDocumentStore((s) => s.setCursorLine);
  const setOutline = useDocumentStore((s) => s.setOutline);
  const readyRef = useRef(false);

  const editor = useEditor({
    extensions: createExtensions(),
    content: initialHtml || '<p></p>',
    editorProps: {
      attributes: {
        class: 'tl-prose focus:outline-none',
        spellcheck: 'true',
      },
      handlePaste: (view, event) => {
        // Image on the clipboard: save as an asset (or embed for unsaved
        // docs) and insert an image node
        const imageFile = Array.from(event.clipboardData?.files ?? []).find((f) =>
          f.type.startsWith('image/'),
        );
        if (imageFile) {
          event.preventDefault();
          pasteImageIntoEditor(view, imageFile).catch((e) => {
            useDocumentStore.getState().setError(e instanceof Error ? e.message : String(e));
          });
          return true;
        }
        // Rich HTML paste: fine by default, unless it carries images whose
        // bytes we must localize (blob: URLs die with the webview session;
        // data: URIs become assets when the doc has a directory). Rewrite
        // through the same persistence rule as a file paste, then insert.
        const html = event.clipboardData?.getData('text/html');
        if (html) {
          if (!needsImageLocalization(html)) return false;
          event.preventDefault();
          void (async () => {
            try {
              const rewritten = await localizeHtmlImages(html);
              const dom = new window.DOMParser().parseFromString(rewritten, 'text/html');
              const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(dom.body);
              view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
            } catch (e) {
              useDocumentStore.getState().setError(e instanceof Error ? e.message : String(e));
            }
          })();
          return true;
        }
        // Plain text that looks like markdown source: parse and insert
        // rendered (Typora-style paste).
        const text = event.clipboardData?.getData('text/plain') ?? '';
        if (!looksLikeMarkdown(text)) return false;
        event.preventDefault();
        const dom = new window.DOMParser().parseFromString(markdownToHtml(text), 'text/html');
        const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(dom.body);
        const tr = view.state.tr.replaceSelection(slice);
        view.dispatch(tr.scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'));
        return true;
      },
      handleDOMEvents: {
        click: (view, event) => {
          const href = (event.target as HTMLElement).closest('a')?.getAttribute('href');
          if (href) {
            // Never let the webview follow the link itself; open externally
            // only via Ctrl/Cmd+click. Plain clicks stay reserved for editing.
            event.preventDefault();
            if (!(event.ctrlKey || event.metaKey)) return false;
            void openHref(href);
            return true;
          }
          // Plain text that looks like a file path: Ctrl/Cmd+click reveals it
          if (!(event.ctrlKey || event.metaKey)) return false;
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          if (pos == null) return false;
          const $pos = view.state.doc.resolve(pos);
          if (!$pos.parent.isTextblock) return false;
          const path = filePathAt($pos.parent.textContent, pos - $pos.start());
          if (!path) return false;
          event.preventDefault();
          void openHref(path);
          return true;
        },
      },
    },
    onUpdate: ({ editor: ed }) => {
      setDirty(true);
      bumpEditTick();
      // Markdown is serialized lazily at save time — doing it here would
      // run a full getHTML + turndown pass on every keystroke
      const storage = ed.storage.characterCount;
      const chars = storage?.characters?.() ?? 0;
      const words = storage?.words?.() ?? 0;
      setCounts(words, chars);
      setCursorLine(lineAt(ed.state));
      setOutline(buildOutline(ed));
    },
    onSelectionUpdate: ({ editor: ed }) => {
      setCursorLine(lineAt(ed.state));
    },
    onCreate: ({ editor: ed }) => {
      const storage = ed.storage.characterCount;
      setCounts(storage?.words?.() ?? 0, storage?.characters?.() ?? 0);
      setCursorLine(lineAt(ed.state));
      setOutline(buildOutline(ed));
      setContentMarkdown(htmlToMarkdown(ed.getHTML()));
    },
  });

  useEffect(() => {
    if (editor && !readyRef.current) {
      readyRef.current = true;
      onReady?.(editor);
    }
  }, [editor, onReady]);

  return (
    <div className="mac-scroll h-full overflow-y-auto print:h-auto print:overflow-y-visible">
      <div className="editor-page mx-auto max-w-[46rem] px-10 py-8">
        <DocumentTitle onRename={(name) => onRename?.(name)} />
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
