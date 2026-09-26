import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, looksLikeMarkdown, markdownToHtml } from './io';
import { decodeTex, splitMathSegments } from './math';

/** Pull the base64 TeX payload out of the first math placeholder. */
function texOf(html: string): string {
  const match = /data-tl-math="([^"]*)"/.exec(html);
  expect(match).not.toBeNull();
  return decodeTex(match?.[1] ?? '');
}

describe('markdownToHtml math', () => {
  it('renders $$...$$ as a display-math placeholder with MathML content', () => {
    const html = markdownToHtml('$$z = \\sqrt{3} + i$$');
    expect(html).toContain('<div data-tl-math=');
    expect(html).toContain('class="tl-math tl-math-block"');
    expect(html).toContain('<math');
    expect(texOf(html)).toBe('z = \\sqrt{3} + i');
  });

  it('renders multi-line $$...$$ blocks', () => {
    const html = markdownToHtml('$$\na^2 + b^2\n= c^2\n$$');
    expect(html).toContain('<div data-tl-math=');
    expect(texOf(html)).toBe('a^2 + b^2\n= c^2');
  });

  it('renders $...$ as an inline placeholder, also next to CJK text', () => {
    const html = markdownToHtml('辐角 $\\theta$ 满足：');
    expect(html).toContain('<span data-tl-math=');
    expect(html).toContain('class="tl-math tl-math-inline"');
    expect(texOf(html)).toBe('\\theta');
  });

  it('renders $$...$$ inside a paragraph as display math', () => {
    // Pandoc/Typora behavior: $$ is display math even mid-line, e.g. when a
    // line got wrapped in ** by accident
    const html = markdownToHtml('**$$z = \\sqrt{3}$$**');
    expect(html).toContain('data-tl-math-display="block"');
    expect(texOf(html)).toBe('z = \\sqrt{3}');
  });

  it('splits adjacent $$A$$$$B$$ into two display blocks', () => {
    const html = markdownToHtml('$$a^2$$$$b^2$$');
    expect(html.match(/data-tl-math=/g)?.length).toBe(2);
  });

  it('leaves currency amounts literal', () => {
    expect(markdownToHtml('pay $5 and $5 more')).not.toContain('data-tl-math');
  });

  it('leaves $...$ inside code spans and fences literal', () => {
    expect(markdownToHtml('`$x$`')).not.toContain('data-tl-math');
    expect(markdownToHtml('```\n$$x$$\n```')).not.toContain('data-tl-math');
  });
});

describe('htmlToMarkdown math', () => {
  it('round-trips display math', () => {
    const md = '$$z = \\sqrt{3} + i$$\n';
    expect(htmlToMarkdown(markdownToHtml(md))).toBe(md);
  });

  it('round-trips inline math inside a sentence', () => {
    expect(htmlToMarkdown(markdownToHtml('辐角 $\\theta$ 满足'))).toBe('辐角 $\\theta$ 满足\n');
  });

  it('round-trips inline display math', () => {
    expect(htmlToMarkdown(markdownToHtml('bold **$$x^2$$** wrap'))).toBe('bold **$$x^2$$** wrap\n');
  });

  it('round-trips math with attribute-hostile characters', () => {
    const md = '$$\\begin{matrix} a & b \\\\ c & d \\end{matrix}$$\n';
    expect(htmlToMarkdown(markdownToHtml(md))).toBe(md);
  });

  it('keeps surrounding markdown intact around math', () => {
    const md = '# Title\n\n已知：\n\n$$|z| = 2$$\n\n辐角 $\\theta$ 满足\n';
    expect(htmlToMarkdown(markdownToHtml(md))).toBe(md);
  });
});

describe('looksLikeMarkdown math', () => {
  it('detects math-only text as markdown', () => {
    expect(looksLikeMarkdown('$$z = \\sqrt{3} + i$$')).toBe(true);
    expect(looksLikeMarkdown('辐角 $\\theta$ 满足')).toBe(true);
  });

  it('does not flag currency', () => {
    expect(looksLikeMarkdown('pay $5 and $5 more')).toBe(false);
  });
});

describe('splitMathSegments', () => {
  it('splits inline and display math from text', () => {
    expect(splitMathSegments('辐角 $\\theta$ 满足, see $$z = 2$$ ok')).toEqual([
      { kind: 'text', text: '辐角 ' },
      { kind: 'math', text: '\\theta', display: false },
      { kind: 'text', text: ' 满足, see ' },
      { kind: 'math', text: 'z = 2', display: true },
      { kind: 'text', text: ' ok' },
    ]);
  });

  it('leaves currency and plain text untouched', () => {
    expect(splitMathSegments('pay $5 and $5 more')).toEqual([
      { kind: 'text', text: 'pay $5 and $5 more' },
    ]);
    expect(splitMathSegments('no math here')).toEqual([{ kind: 'text', text: 'no math here' }]);
  });
});
