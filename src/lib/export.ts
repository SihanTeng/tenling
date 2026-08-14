import { decodeComment } from './markdown/comments';

/**
 * Standalone HTML export. The body comes from markdownToHtml(current
 * markdown) so the export matches what the file itself contains. Comment
 * placeholder elements (an editor-internal transport, see
 * lib/markdown/comments) are swapped back for real HTML comments so the
 * exported file is clean, self-contained HTML.
 */

const EXPORT_CSS = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.65;
    color: #1d1d1f;
    max-width: 46rem;
    margin: 0 auto;
    padding: 3rem 2rem;
  }
  h1 { font-size: 1.85rem; letter-spacing: -0.02em; margin: 1.4em 0 0.5em; }
  h2 { font-size: 1.4rem; letter-spacing: -0.015em; margin: 1.25em 0 0.45em; }
  h3 { font-size: 1.15rem; margin: 1.1em 0 0.4em; }
  h4 { font-size: 1rem; margin: 1em 0 0.35em; }
  h5 { font-size: 0.92rem; margin: 1em 0 0.35em; }
  h6 { font-size: 0.85rem; color: #6e6e73; margin: 1em 0 0.35em; }
  p { margin: 0.55em 0; }
  a { color: #007aff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul { list-style: disc; }
  ul ul { list-style: circle; }
  ul ul ul { list-style: square; }
  ol { list-style: decimal; }
  ol ol { list-style: lower-alpha; }
  ol ol ol { list-style: lower-roman; }
  ul, ol { padding-left: 1.4em; margin: 0.5em 0; }
  li { margin: 0.2em 0; }
  li p { margin: 0; }
  ul:has(> li > input[type="checkbox"]) { list-style: none; padding-left: 1.4em; }
  /* Checkbox hangs in the indent slot like a list marker: 1em box + 0.4em
     gap = the 1.4em padding, so task text aligns with bullet text */
  li > input[type="checkbox"] { width: 1em; height: 1em; margin: 0 0.4em 0 -1.4em; vertical-align: -0.1em; }
  blockquote {
    border-left: 3px solid rgba(0, 0, 0, 0.12);
    margin: 0.85em 0;
    padding: 0.15em 0 0.15em 1em;
    color: #6e6e73;
  }
  code {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.9em;
    background: rgba(0, 0, 0, 0.04);
    padding: 0.12em 0.35em;
    border-radius: 4px;
  }
  pre {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 13px;
    background: rgba(0, 0, 0, 0.04);
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 8px;
    padding: 0.85em 1em;
    overflow-x: auto;
    line-height: 1.5;
  }
  pre code { background: none; padding: 0; font-size: inherit; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; margin: 0.85em 0; }
  th, td { border: 1px solid rgba(0, 0, 0, 0.12); padding: 0.35em 0.7em; text-align: left; vertical-align: top; }
  th { background: rgba(0, 0, 0, 0.04); font-weight: 600; }
  img { max-width: 100%; border-radius: 8px; }
  hr { border: none; border-top: 1px solid rgba(0, 0, 0, 0.12); margin: 1.4em 0; }
  /* Math placeholders carry MathML-only KaTeX output (see lib/markdown/math),
     which browsers render natively — no fonts or CSS needed here */
  .tl-math-block { margin: 0.9em 0; text-align: center; overflow-x: auto; }
  .tl-math-inline[data-tl-math-display="block"] { display: block; margin: 0.9em 0; text-align: center; overflow-x: auto; }
  .hljs-keyword, .hljs-selector-tag, .hljs-built_in { color: #cf222e; }
  .hljs-string, .hljs-attr, .hljs-template-string { color: #0a3069; }
  .hljs-number, .hljs-literal { color: #0550ae; }
  .hljs-comment, .hljs-quote { color: #6e7781; font-style: italic; }
  .hljs-title, .hljs-title.function_, .hljs-section { color: #8250df; }
  .hljs-title.class_, .hljs-type { color: #953800; }
  .hljs-variable, .hljs-template-variable { color: #e36209; }
  .hljs-meta, .hljs-tag, .hljs-name { color: #116329; }
  @media print {
    body { max-width: none; padding: 0; }
    pre { white-space: pre-wrap; }
  }
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Swap editor-internal comment placeholders back for real HTML comments. */
export function restoreComments(bodyHtml: string): string {
  return bodyHtml
    .replace(/<div data-tl-comment="([^"]*)"[^>]*>[^<]*<\/div>/g, (_m, b64: string) =>
      decodeComment(b64),
    )
    .replace(/<span data-tl-comment="([^"]*)"[^>]*>[^<]*<\/span>/g, (_m, b64: string) =>
      decodeComment(b64),
    );
}

export function buildExportHtmlDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="TenLing">
<title>${escapeHtml(title)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
${restoreComments(bodyHtml)}
</body>
</html>
`;
}
