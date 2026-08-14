import katex from 'katex';
import type { TokenizerAndRendererExtension } from 'marked';
import { decodeComment, encodeComment } from './comments';

/**
 * LaTeX math preservation ($inline$ and $$block$$), modeled on the comment
 * pipeline in comments.ts: marked tokenizers turn math into placeholder
 * elements (`<div/span data-tl-math="...">`) that carry the TeX source
 * base64-encoded. The editor parses these into atom nodes whose node views
 * render full KaTeX; the turndown rule in io.ts restores `$...$` on save.
 *
 * The placeholder's visible content is MathML-only KaTeX output: the editor
 * node view re-renders from the attribute anyway, and the standalone HTML
 * export (lib/export.ts) gets math that browsers render natively without
 * bundling KaTeX CSS or fonts.
 */

/** Same base64 transport as comments — survives any TeX in an attribute. */
export const encodeTex = encodeComment;
export const decodeTex = decodeComment;

function renderMathMl(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    output: 'mathml',
    throwOnError: false,
  });
}

export const mathMarkedExtensions: TokenizerAndRendererExtension[] = [
  {
    // $$...$$ starting a line (single- or multi-line) → display math
    name: 'mathBlock',
    level: 'block',
    start(src: string) {
      const match = /(?:^|\n)[ \t]{0,3}\$\$/.exec(src);
      return match ? match.index + match[0].length - 2 : undefined;
    },
    tokenizer(src: string) {
      // Close at the first $$ — even mid-line — so adjacent blocks
      // ($$A$$$$B$$) split into two; $ never appears inside display tex
      const match = /^[ \t]{0,3}\$\$([\s\S]+?)\$\$/.exec(src);
      if (!match) return undefined;
      return { type: 'mathBlock', raw: match[0], text: match[1].trim() };
    },
    renderer(token) {
      return `<div data-tl-math="${encodeTex(token.text)}" class="tl-math tl-math-block">${renderMathMl(token.text, true)}</div>\n`;
    },
  },
  {
    // $$...$$ inline (e.g. bold-wrapped or mid-paragraph) → display math.
    // Pandoc/Typora treat $$ as display math regardless of position.
    name: 'mathInlineDisplay',
    level: 'inline',
    start(src: string) {
      const i = src.indexOf('$$');
      return i < 0 ? undefined : i;
    },
    tokenizer(src: string) {
      const match = /^\$\$([^$\n]+?)\$\$/.exec(src);
      if (!match) return undefined;
      return { type: 'mathInlineDisplay', raw: match[0], text: match[1].trim() };
    },
    renderer(token) {
      return `<span data-tl-math="${encodeTex(token.text)}" data-tl-math-display="block" class="tl-math tl-math-inline">${renderMathMl(token.text, true)}</span>`;
    },
  },
  {
    // $...$ inline. Flanking rules keep currency ("$5 and $5") literal:
    // content may not touch the delimiters with whitespace, contain no $,
    // and the closing $ may not be followed by a digit.
    name: 'mathInline',
    level: 'inline',
    start(src: string) {
      const i = src.indexOf('$');
      return i < 0 ? undefined : i;
    },
    tokenizer(src: string) {
      const match = /^\$(?!\$)([^\s$](?:[^$\n]*[^\s$])?)\$(?![\d$])/.exec(src);
      if (!match) return undefined;
      return { type: 'mathInline', raw: match[0], text: match[1] };
    },
    renderer(token) {
      return `<span data-tl-math="${encodeTex(token.text)}" class="tl-math tl-math-inline">${renderMathMl(token.text, false)}</span>`;
    },
  },
];
