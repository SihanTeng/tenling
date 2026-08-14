import { Extension } from '@tiptap/core';
import { type EditorState, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';

/**
 * Companion to the live preview: when the cursor leaves a text block, any
 * raw markdown written into it (e.g. by typing `**` first and filling the
 * middle, which input rules can't catch) is converted to real marks.
 * Inline: bold, italic, strike, code, links. Block: `# ` heading prefixes.
 */

interface Match {
  from: number;
  to: number;
  text: string;
  mark: string;
  href?: string;
}

// Content may not start/end with whitespace (approximates flanking rules,
// so `2 * 3 * 4` stays literal)
const INNER = (ch: string) => `[^${ch}\\s](?:[^${ch}\\n]*[^${ch}\\s])?`;
const PATTERNS: { mark: string; regex: RegExp }[] = [
  { mark: 'bold', regex: new RegExp(`\\*\\*(${INNER('*')})\\*\\*`, 'g') },
  { mark: 'bold', regex: new RegExp(`__(${INNER('_')})__`, 'g') },
  { mark: 'italic', regex: new RegExp(`\\*(${INNER('*')})\\*`, 'g') },
  { mark: 'italic', regex: new RegExp(`_(${INNER('_')})_`, 'g') },
  { mark: 'strike', regex: new RegExp(`~~(${INNER('~')})~~`, 'g') },
  { mark: 'code', regex: new RegExp(`\`(${INNER('`')})\``, 'g') },
];
const LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
// Same flanking rules as the marked tokenizer in lib/markdown/math.ts:
// no $$, no whitespace against the delimiters, no digit after the closer
const MATH_RE = /\$(?!\$)([^\s$](?:[^$\n]*[^\s$])?)\$(?![\d$])/g;
// Inline $$...$$ (display math inside a paragraph); tried before MATH_RE
const MATH_DISPLAY_RE = /\$\$([^$\n]+?)\$\$/g;

function findMatches(text: string): Match[] {
  const matches: Match[] = [];
  for (const m of text.matchAll(LINK_RE)) {
    matches.push({
      from: m.index,
      to: m.index + m[0].length,
      text: m[1],
      mark: 'link',
      href: m[2],
    });
  }
  for (const { mark, regex } of PATTERNS) {
    for (const m of text.matchAll(regex)) {
      matches.push({ from: m.index, to: m.index + m[0].length, text: m[1], mark });
    }
  }
  // Inline math becomes an atom node, not a mark (handled in convertBlock);
  // $$...$$ display math first so the single-$ pattern can't split it
  for (const m of text.matchAll(MATH_DISPLAY_RE)) {
    matches.push({
      from: m.index,
      to: m.index + m[0].length,
      text: m[1],
      mark: 'mathDisplay',
    });
  }
  for (const m of text.matchAll(MATH_RE)) {
    matches.push({ from: m.index, to: m.index + m[0].length, text: m[1], mark: 'math' });
  }
  // Greedy left-to-right, longest first on ties; skip overlaps (so `**x**`
  // is bold, not italic around `*x*`)
  matches.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));
  const result: Match[] = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.from < lastEnd) continue;
    result.push(m);
    lastEnd = m.to;
  }
  return result;
}

function delimiterLength(mark: string, side: 'open' | 'close', href?: string): number {
  if (mark === 'link') return side === 'open' ? 1 : 3 + (href?.length ?? 0);
  return mark === 'bold' || mark === 'strike' ? 2 : 1;
}

function convertBlock(state: EditorState, pos: number): Transaction | null {
  if (pos < 0 || pos >= state.doc.content.size) return null;
  // `pos` is the position *before* the block node — nodeAfter is the block
  // itself (resolving pos directly would yield the doc as parent)
  const block = state.doc.resolve(pos).nodeAfter;
  if (!block?.isTextblock || block.type.name === 'codeBlock') return null;

  const text = block.textContent;

  // A paragraph holding only $$...$$ becomes a display-math node
  if (block.type.name === 'paragraph' && state.schema.nodes.mathBlock) {
    const display = /^\$\$([\s\S]+?)\$\$$/.exec(text.trim());
    if (display) {
      return state.tr.replaceWith(
        pos,
        pos + block.nodeSize,
        state.schema.nodes.mathBlock.create({ tex: display[1].trim() }),
      );
    }
  }

  const matches = findMatches(text);
  const headingMatch = block.type.name === 'paragraph' ? /^(#{1,6})\s/.exec(text) : null;
  if (matches.length === 0 && !headingMatch) return null;

  const contentStart = pos + 1;
  const tr = state.tr;
  const schema = state.schema;
  const deletions: { from: number; to: number }[] = [];
  // Inline math matches replace their range with a mathInline atom node
  const replacements: { from: number; to: number; tex: string; display: boolean }[] = [];

  for (const m of matches) {
    const from = contentStart + m.from;
    const to = contentStart + m.to;
    if (m.mark === 'math' || m.mark === 'mathDisplay') {
      if (schema.nodes.mathInline) {
        replacements.push({ from, to, tex: m.text, display: m.mark === 'mathDisplay' });
      }
      continue;
    }
    const markType = schema.marks[m.mark];
    if (!markType) continue;
    const openLen = delimiterLength(m.mark, 'open');
    const closeLen = delimiterLength(m.mark, 'close', m.href);
    tr.addMark(
      from + openLen,
      to - closeLen,
      m.mark === 'link' ? markType.create({ href: m.href }) : markType.create(),
    );
    deletions.push({ from: to - closeLen, to });
    deletions.push({ from, to: from + openLen });
  }

  if (headingMatch) {
    tr.setNodeMarkup(pos, schema.nodes.heading, { level: headingMatch[1].length });
    deletions.push({ from: contentStart, to: contentStart + headingMatch[0].length });
  }

  // Apply right-to-left so earlier positions stay valid
  deletions.sort((a, b) => b.from - a.from);
  replacements.sort((a, b) => b.from - a.from);
  let di = 0;
  let ri = 0;
  while (di < deletions.length || ri < replacements.length) {
    const d = deletions[di];
    const r = replacements[ri];
    if (r && (!d || r.from > d.from)) {
      tr.replaceWith(
        r.from,
        r.to,
        schema.nodes.mathInline.create({ tex: r.tex, display: r.display }),
      );
      ri++;
    } else if (d) {
      tr.delete(d.from, d.to);
      di++;
    }
  }

  return tr.steps.length > 0 ? tr : null;
}

export const ConvertOnLeave = Extension.create({
  name: 'convertOnLeave',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('convertOnLeave'),
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged || tr.selectionSet)) return null;
          const $old = oldState.selection.$from;
          const $new = newState.selection.$from;
          // AllSelection / top-level selections have no parent block
          if ($old.depth === 0 || $new.depth === 0) return null;
          let pos = $old.before();
          for (const tr of transactions) pos = tr.mapping.map(pos);
          // Still in the same block — keep it raw while editing
          if ($new.before() === pos) return null;
          try {
            return convertBlock(newState, pos);
          } catch {
            return null; // block was deleted or moved out of range
          }
        },
      }),
    ];
  },
});
