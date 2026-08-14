import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { createCodeBlock } from './codeBlock';
import { ConvertOnLeave } from './convertOnLeave';
import { FindReplace } from './findReplace';
import { createImage } from './image';
import { LivePreview } from './livePreview';
import { MathBlock, MathInline } from './math';
import { MdCommentBlock, MdCommentInline } from './mdComment';
import { SlashCommands } from './slashCommands';
import { TableFromPipes } from './tableFromPipes';

// Lightweight highlight.js core with the common grammar bundle (~40 languages)
const lowlight = createLowlight(common);

export function createExtensions() {
  return [
    StarterKit.configure({
      // All six ATX levels: loaded #### headings used to flatten into plain
      // paragraphs and lose their hashes on save. The toolbar exposes H1–H3
      // only; deeper levels arrive via files, paste, or typing the hashes.
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // Replaced by CodeBlockLowlight below (syntax highlighting)
      codeBlock: false,
      // StarterKit ships Link — configure it here instead of adding a
      // duplicate extension. External opening is handled by the editor's
      // click handler (Ctrl/Cmd+click only).
      link: {
        openOnClick: false,
        HTMLAttributes: {
          class: 'tl-link',
        },
      },
    }),
    createCodeBlock(lowlight),
    Placeholder.configure({
      placeholder: 'Start writing…',
    }),
    // marked emits task lists as plain <ul><li><input type="checkbox">… —
    // teach TaskList/TaskItem to parse that form (TipTap only matches its
    // own data-type attributes by default)
    TaskList.extend({
      parseHTML() {
        return [
          ...(this.parent?.() ?? []),
          { tag: 'ul:has(> li > input[type="checkbox"])', priority: 60 },
        ];
      },
    }),
    TaskItem.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          checked: {
            default: false,
            keepOnSplit: false,
            // TipTap's attribute-level parseHTML overrides any rule-level
            // getAttrs, so read marked's <input checked> here
            parseHTML: (element: HTMLElement) => {
              const dataChecked = element.getAttribute('data-checked');
              if (dataChecked === '' || dataChecked === 'true') return true;
              const input = element.querySelector('input[type="checkbox"]');
              return input ? input.hasAttribute('checked') : false;
            },
            renderHTML: (attributes) => ({ 'data-checked': attributes.checked }),
          },
        };
      },
      parseHTML() {
        return [
          ...(this.parent?.() ?? []),
          { tag: 'li:has(> input[type="checkbox"])', priority: 60 },
        ];
      },
    }).configure({
      nested: true,
    }),
    CharacterCount,
    // GFM tables: schema support so loaded/pasted tables survive editing
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TableFromPipes,
    MdCommentBlock,
    MdCommentInline,
    // LaTeX: $...$ / $$...$$ placeholders become KaTeX-rendered atom nodes
    MathBlock,
    MathInline,
    FindReplace,
    // "/" menu: state-only plugin; SlashMenuOverlay renders and handles keys
    SlashCommands,
    createImage(),
    LivePreview,
    ConvertOnLeave,
  ];
}
