import { marked } from 'marked';
import TurndownService from 'turndown';
import { commentMarkedExtensions, decodeComment } from './comments';
import { decodeTex, mathMarkedExtensions } from './math';

/** Configure marked for GFM-ish HTML output suitable for TipTap. */
marked.setOptions({
  gfm: true,
  breaks: false,
});

// Intercept HTML comments and LaTeX math before marked's built-in
// tokenizers so they survive the editor as placeholder elements
// (see comments.ts and math.ts)
marked.use({ extensions: [...commentMarkedExtensions, ...mathMarkedExtensions] });

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});

// Strikethrough: marked emits <del>, TipTap's Strike mark emits <s> — without
// a rule turndown silently dropped the mark on save
turndown.addRule('strikethrough', {
  filter: ['del', 's', 'strike'] as unknown as TurndownService.Filter,
  replacement: (content) => `~~${content}~~`,
});

// Underline: no Markdown syntax exists — Typora's convention is inline HTML
turndown.addRule('underline', {
  filter: 'u',
  replacement: (content) => `<u>${content}</u>`,
});

// HTML comments: restore the original `<!-- ... -->` from the placeholder
// elements produced on load (block comments own their lines, inline don't)
turndown.addRule('mdComment', {
  filter: (node) => {
    if (node.nodeName !== 'DIV' && node.nodeName !== 'SPAN') return false;
    return (node as HTMLElement).hasAttribute('data-tl-comment');
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const raw = decodeComment(el.getAttribute('data-tl-comment') ?? '');
    return el.nodeName === 'DIV' ? `\n\n${raw}\n\n` : raw;
  },
});

// LaTeX math: restore the original $...$ / $$...$$ from the placeholder
// elements produced on load (block math owns its lines, inline doesn't)
turndown.addRule('math', {
  filter: (node) => {
    if (node.nodeName !== 'DIV' && node.nodeName !== 'SPAN') return false;
    return (node as HTMLElement).hasAttribute('data-tl-math');
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const tex = decodeTex(el.getAttribute('data-tl-math') ?? '');
    if (el.nodeName === 'DIV') return `\n\n$$${tex}$$\n\n`;
    // Inline $$...$$ keeps its display delimiters (see math.ts)
    return el.getAttribute('data-tl-math-display') === 'block' ? `$$${tex}$$` : `$${tex}$`;
  },
});

// Task list items
turndown.addRule('taskListItem', {
  filter: (node) => node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem',
  replacement: (content, node) => {
    const checked =
      (node as HTMLElement).getAttribute('data-checked') === 'true' ||
      !!(node as HTMLElement).querySelector('input[type="checkbox"][checked]');
    const text = content.replace(/^\n+/, '').replace(/\n+$/, '').replace(/\n/gm, '\n  ');
    return `- [${checked ? 'x' : ' '}] ${text}\n`;
  },
});

turndown.addRule('taskList', {
  filter: (node) => node.nodeName === 'UL' && node.getAttribute('data-type') === 'taskList',
  replacement: (content) => content,
});

// GFM tables: rebuild pipe syntax from the DOM (cell alignment attributes are
// honored when present, though the editor schema currently drops them)
turndown.addRule('table', {
  filter: 'table',
  replacement: (_content, node) => {
    const rows = Array.from((node as HTMLTableElement).rows);
    if (rows.length === 0) return '';

    const cellText = (cell: HTMLTableCellElement) =>
      turndown
        .turndown(cell.innerHTML)
        .replace(/\|/g, '\\|')
        .replace(/\s*\n\s*/g, ' ')
        .trim();

    const delimiterFor = (cell: HTMLTableCellElement) => {
      const align = cell.getAttribute('align') ?? cell.style.textAlign;
      if (align === 'center') return ':---:';
      if (align === 'right') return '---:';
      return '---';
    };

    // GFM requires a header row — use the first row whether or not it has <th>
    const headerCells = Array.from(rows[0].cells);
    const lines = [
      `| ${headerCells.map(cellText).join(' | ')} |`,
      `| ${headerCells.map(delimiterFor).join(' | ')} |`,
      ...rows.slice(1).map((r) => `| ${Array.from(r.cells).map(cellText).join(' | ')} |`),
    ];
    return `\n\n${lines.join('\n')}\n\n`;
  },
});

export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return '<p></p>';
  const html = marked.parse(markdown, { async: false }) as string;
  return html;
}

/**
 * Heuristic: does pasted plain text look like markdown source worth parsing?
 * Structural markers (headings, lists, quotes, fences) or inline formatting.
 */
export function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,6}\s/m.test(text) ||
    /^\s*[-*+]\s/m.test(text) ||
    /^\s*\d+\.\s/m.test(text) ||
    /^\s*>\s/m.test(text) ||
    /```/.test(text) ||
    // GFM table delimiter row (| --- | :---: |)
    /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/m.test(text) ||
    /\*\*[^*\n]+\*\*/.test(text) ||
    /(^|[^*])\*[^*\n]+\*/.test(text) ||
    /`[^`\n]+`/.test(text) ||
    // LaTeX math (same flanking rules as the tokenizer in math.ts)
    /\$\$[^$\n]+\$\$/.test(text) ||
    /\$(?!\$)[^\s$](?:[^$\n]*[^\s$])?\$(?![\d$])/.test(text) ||
    // links and images (alt text may be empty)
    /!?\[[^\]\n]*\]\([^)\n]+\)/.test(text)
  );
}

export function htmlToMarkdown(html: string): string {
  if (!html || html === '<p></p>') return '';
  return turndown.turndown(html).trim() + (html.trim() ? '\n' : '');
}

export function fileNameFromPath(path: string | null | undefined): string {
  if (!path) return 'Untitled';
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || 'Untitled';
}
