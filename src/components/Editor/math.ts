import { mergeAttributes, Node } from '@tiptap/core';
import katex from 'katex';
import { decodeTex, encodeTex } from '../../lib/markdown/math';

/**
 * Editor-side half of LaTeX support (see lib/markdown/math). Placeholder
 * `<div/span data-tl-math>` elements parse into atom nodes; node views
 * render the full KaTeX output (HTML + MathML) while renderHTML re-emits
 * the placeholder form so the turndown rule in io.ts restores `$...$` /
 * `$$...$$` on save.
 */

const mathAttribute = {
  tex: {
    default: '',
    parseHTML: (element: HTMLElement) => decodeTex(element.getAttribute('data-tl-math') ?? ''),
    renderHTML: (attributes: Record<string, unknown>) => ({
      'data-tl-math': encodeTex(String(attributes.tex ?? '')),
    }),
  },
};

const displayAttribute = {
  // Inline $$...$$ (Pandoc-style display math inside a paragraph)
  display: {
    default: false,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-tl-math-display') === 'block',
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.display ? { 'data-tl-math-display': 'block' } : {},
  },
};

function mathView(display: boolean) {
  return ({ node }: { node: { attrs: Record<string, unknown> } }) => {
    const dom = document.createElement(display ? 'div' : 'span');
    const displayMode = display || node.attrs.display === true;
    dom.className = display
      ? 'tl-math tl-math-block'
      : `tl-math tl-math-inline${displayMode ? ' tl-math-display' : ''}`;
    dom.contentEditable = 'false';
    katex.render(String(node.attrs.tex ?? ''), dom, {
      displayMode,
      throwOnError: false,
    });
    return { dom };
  };
}

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return mathAttribute;
  },

  parseHTML() {
    return [{ tag: 'div[data-tl-math]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // The zero-width space payload keeps turndown's blank rule from
    // deleting the element before our rule can restore the TeX source
    return ['div', mergeAttributes(HTMLAttributes, { class: 'tl-math tl-math-block' }), '\u200b'];
  },

  addNodeView() {
    return mathView(true);
  },
});

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return { ...mathAttribute, ...displayAttribute };
  },

  parseHTML() {
    return [{ tag: 'span[data-tl-math]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'tl-math tl-math-inline' }), '\u200b'];
  },

  addNodeView() {
    return mathView(false);
  },
});
