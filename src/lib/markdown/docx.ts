/**
 * DOCX export. Markdown goes through the same marked pipeline as the HTML
 * export, then the resulting DOM is walked into a `docx`-package tree:
 * headings, paragraphs, lists (bullets, ordered, task checkboxes),
 * blockquotes, code blocks and tables map to their Word equivalents.
 *
 * Images embed when the caller's resolver can read them (local files next
 * to the document, data: URIs from pastes); anything unresolvable degrades
 * to its alt text so the export never fails on a missing asset.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { markdownToHtml } from './io';
import { decodeTex } from './math';

/** Image payload ready for embedding; a resolver returns null to drop it. */
export interface ResolvedImage {
  data: Uint8Array;
  width: number;
  height: number;
  /** Formats Word can embed (no webp/svg — the resolver filters those). */
  type: 'png' | 'jpg' | 'gif' | 'bmp';
}

export type ImageResolver = (src: string, alt: string) => Promise<ResolvedImage | null>;

type Block = Paragraph | Table;

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: boolean;
}

const HEADING_LEVEL: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  H1: HeadingLevel.HEADING_1,
  H2: HeadingLevel.HEADING_2,
  H3: HeadingLevel.HEADING_3,
  H4: HeadingLevel.HEADING_4,
  H5: HeadingLevel.HEADING_5,
  H6: HeadingLevel.HEADING_6,
};

/** Extra options giving blockquote paragraphs their indent + left rule. */
function quoteStyle(inQuote: boolean) {
  return inQuote
    ? {
        indent: { left: 480 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC', space: 8 } },
      }
    : {};
}

function textRun(text: string, style: InlineStyle): TextRun {
  return new TextRun({
    text,
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    font: style.code ? 'Consolas' : undefined,
    color: style.link ? '0A3069' : undefined,
    underline: style.link ? {} : undefined,
  });
}

/** Inline walk: text nodes become runs, formatting tags set run options. */
function inlineRuns(node: Node, style: InlineStyle, out: TextRun[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    // marked emits newlines between source lines; collapse to a space
    const text = (node.textContent ?? '').replace(/\s*\n\s*/g, ' ');
    if (text) out.push(textRun(text, style));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  // Math placeholders degrade to their TeX source (no OMML conversion)
  if (el.hasAttribute('data-tl-math')) {
    const tex = decodeTex(el.getAttribute('data-tl-math') ?? '');
    if (!tex) return;
    const display = el.getAttribute('data-tl-math-display') === 'block';
    out.push(textRun(display ? `$$${tex}$$` : `$${tex}$`, style));
    return;
  }
  switch (el.tagName) {
    case 'STRONG':
    case 'B':
      style = { ...style, bold: true };
      break;
    case 'EM':
    case 'I':
      style = { ...style, italics: true };
      break;
    case 'DEL':
    case 'S':
      style = { ...style, strike: true };
      break;
    case 'CODE':
      style = { ...style, code: true };
      break;
    case 'A':
      style = { ...style, link: true };
      break;
    case 'BR':
      out.push(new TextRun({ break: 1 }));
      return;
    case 'IMG': {
      // Inline images are rare; block-level ones are embedded by blockChildren
      const alt = el.getAttribute('alt') ?? '';
      out.push(textRun(alt ? `[${alt}]` : '[image]', { ...style, italics: true }));
      return;
    }
    case 'INPUT':
      return; // task-list checkbox — handled by the list walker
  }
  for (const child of Array.from(el.childNodes)) inlineRuns(child, style, out);
}

function runsOf(el: Element, style: InlineStyle = {}): TextRun[] {
  const out: TextRun[] = [];
  for (const child of Array.from(el.childNodes)) inlineRuns(child, style, out);
  return out;
}

/** Numbering config collected during the walk — one reference per top-level
 *  ordered list so each list restarts at 1. */
interface NumberingConfig {
  reference: string;
  levels: Array<{
    level: number;
    format: (typeof LevelFormat)[keyof typeof LevelFormat];
    text: string;
    alignment: (typeof AlignmentType)[keyof typeof AlignmentType];
  }>;
}

interface WalkCtx {
  resolveImage?: ImageResolver;
  numbering: NumberingConfig[];
  orderedLists: number;
}

async function listItems(
  list: Element,
  level: number,
  reference: string | null,
  ctx: WalkCtx,
  out: Block[],
): Promise<void> {
  for (const li of Array.from(list.children)) {
    if (li.tagName !== 'LI') continue;
    const checkbox = li.querySelector(':scope > input[type="checkbox"]');
    const runs: TextRun[] = [];
    if (checkbox) runs.push(textRun(checkbox.hasAttribute('checked') ? '☑ ' : '☐ ', {}));
    for (const child of Array.from(li.childNodes)) {
      // Nested lists become following paragraphs at the next indent level
      if (child.nodeType === Node.ELEMENT_NODE && ['UL', 'OL'].includes((child as Element).tagName))
        continue;
      inlineRuns(child, {}, runs);
    }
    out.push(
      new Paragraph({
        children: runs,
        // Task lists hang the checkbox glyph off a bullet indent
        bullet: checkbox || !reference ? { level } : undefined,
        numbering: !checkbox && reference ? { reference, level } : undefined,
      }),
    );
    for (const child of Array.from(li.children)) {
      if (child.tagName === 'UL') await listItems(child, level + 1, null, ctx, out);
      if (child.tagName === 'OL') await listItems(child, level + 1, reference, ctx, out);
    }
  }
}

function tableOf(el: Element): Table {
  const rows = Array.from(el.querySelectorAll(':scope > thead > tr, :scope > tbody > tr'));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (tr) =>
        new TableRow({
          tableHeader: tr.parentElement?.tagName === 'THEAD',
          children: Array.from(tr.children).map(
            (cell) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: runsOf(cell, cell.tagName === 'TH' ? { bold: true } : {}),
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

async function blockChildren(el: Element, inQuote: boolean, ctx: WalkCtx, out: Block[]) {
  // Display math degrades to a centered paragraph with the TeX source
  if (el.hasAttribute('data-tl-math')) {
    const tex = decodeTex(el.getAttribute('data-tl-math') ?? '');
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: tex ? [textRun(`$$${tex}$$`, {})] : [],
        ...quoteStyle(inQuote),
      }),
    );
    return;
  }
  switch (el.tagName) {
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
      out.push(
        new Paragraph({
          heading: HEADING_LEVEL[el.tagName],
          children: runsOf(el),
          ...quoteStyle(inQuote),
        }),
      );
      return;
    case 'P': {
      const onlyImg =
        el.children.length === 1 &&
        el.firstElementChild?.tagName === 'IMG' &&
        !(el.textContent ?? '').trim();
      if (onlyImg) {
        const img = el.firstElementChild as Element;
        const alt = img.getAttribute('alt') ?? '';
        const resolved = await ctx.resolveImage?.(img.getAttribute('src') ?? '', alt);
        out.push(
          new Paragraph({
            children: resolved
              ? [
                  new ImageRun({
                    data: resolved.data,
                    transformation: { width: resolved.width, height: resolved.height },
                    type: resolved.type,
                  }),
                ]
              : [textRun(alt ? `[${alt}]` : '[image]', { italics: true })],
            ...quoteStyle(inQuote),
          }),
        );
        return;
      }
      out.push(new Paragraph({ children: runsOf(el), ...quoteStyle(inQuote) }));
      return;
    }
    case 'UL':
      await listItems(el, 0, null, ctx, out);
      return;
    case 'OL': {
      const reference = `ordered-${++ctx.orderedLists}`;
      ctx.numbering.push({
        reference,
        levels: [0, 1, 2].map((level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.START,
        })),
      });
      await listItems(el, 0, reference, ctx, out);
      return;
    }
    case 'BLOCKQUOTE':
      for (const child of Array.from(el.children)) await blockChildren(child, true, ctx, out);
      return;
    case 'PRE': {
      const lines = (el.textContent ?? '').replace(/\n$/, '').split('\n');
      out.push(
        new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
          children: lines.flatMap((line, i) =>
            i === 0
              ? [textRun(line, { code: true })]
              : [new TextRun({ break: 1 }), textRun(line, { code: true })],
          ),
          ...quoteStyle(inQuote),
        }),
      );
      return;
    }
    case 'TABLE':
      out.push(tableOf(el));
      return;
    case 'HR':
      out.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } },
        }),
      );
      return;
    default:
      // DIV wrappers (comment placeholders) and friends: walk their children
      for (const child of Array.from(el.children)) await blockChildren(child, inQuote, ctx, out);
  }
}

/** Convert markdown to a docx Document — the inspectable step before packing. */
export async function markdownToDocxDocument(
  markdown: string,
  resolveImage?: ImageResolver,
): Promise<Document> {
  const html = markdownToHtml(markdown);
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const ctx: WalkCtx = { resolveImage, numbering: [], orderedLists: 0 };
  const children: Block[] = [];
  for (const el of Array.from(dom.body.children)) await blockChildren(el, false, ctx, children);
  return new Document({
    numbering: { config: ctx.numbering },
    sections: [{ children }],
  });
}

/** Convert markdown to a base64-encoded .docx, ready for writeBinaryFile. */
export async function markdownToDocxBase64(
  markdown: string,
  resolveImage?: ImageResolver,
): Promise<string> {
  return Packer.toBase64String(await markdownToDocxDocument(markdown, resolveImage));
}
