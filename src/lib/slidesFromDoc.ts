import type { JSONContent } from '@tiptap/react';

export interface Slide {
  /** Unique, stable key for React (slug + occurrence count for repeated titles). */
  id: string;
  title: string;
  body: string[];
  level: 1 | 2;
}

function textFromNode(node: JSONContent | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text ?? '';
  // Math atoms have no text children; show the TeX source on slides
  if (node.type === 'mathInline' || node.type === 'mathBlock') {
    const tex = node.attrs?.tex;
    return typeof tex === 'string' && tex ? `$${tex}$` : '';
  }
  if (!node.content) return '';
  return node.content.map(textFromNode).join('');
}

function blockToLines(node: JSONContent): string[] {
  switch (node.type) {
    case 'paragraph': {
      const t = textFromNode(node).trim();
      return t ? [t] : [];
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return (node.content ?? []).flatMap((item) => {
        const line = textFromNode(item).trim();
        if (!line) return [];
        if (node.type === 'taskList') {
          const checked = item.attrs?.checked ? '☑' : '☐';
          return [`${checked} ${line}`];
        }
        return [`• ${line}`];
      });
    case 'blockquote':
      return (node.content ?? []).flatMap(blockToLines).map((l) => `“${l}”`);
    case 'codeBlock': {
      const t = textFromNode(node).trim();
      return t ? [t] : [];
    }
    default:
      return [];
  }
}

/** Slide before its unique id is assigned. */
type SlideDraft = Omit<Slide, 'id'>;

/** Build presentation slides from TipTap JSON: H1/H2 start slides. */
export function slidesFromDoc(doc: JSONContent | null | undefined): Slide[] {
  const content = doc?.content ?? [];
  if (content.length === 0) {
    return [
      {
        id: 'empty-document',
        title: 'Empty document',
        body: ['Add headings to create slides.'],
        level: 1,
      },
    ];
  }

  const slides: SlideDraft[] = [];
  let current: SlideDraft | null = null;

  const flush = () => {
    if (current) slides.push(current);
    current = null;
  };

  for (const node of content) {
    if (node.type === 'heading') {
      const level = (node.attrs?.level ?? 1) as number;
      if (level === 1 || level === 2) {
        flush();
        current = {
          title: textFromNode(node).trim() || 'Untitled',
          body: [],
          level: level as 1 | 2,
        };
        continue;
      }
      // h3+ as body line
      if (!current) {
        current = { title: 'Introduction', body: [], level: 1 };
      }
      const t = textFromNode(node).trim();
      if (t) current.body.push(t);
      continue;
    }

    if (!current) {
      current = { title: 'Introduction', body: [], level: 1 };
    }
    current.body.push(...blockToLines(node));
  }

  flush();

  if (slides.length === 0) {
    return [{ id: 'document', title: 'Document', body: ['No headings found.'], level: 1 }];
  }

  // Assign unique ids (repeated titles get an occurrence suffix) and cap body
  // lines for readable slides
  const seen = new Map<string, number>();
  return slides.map((s) => {
    const slug = s.title.toLowerCase().replace(/\s+/g, '-') || 'slide';
    const n = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, n);
    return {
      ...s,
      id: n === 1 ? slug : `${slug}-${n}`,
      body: s.body.filter(Boolean).slice(0, 10),
    };
  });
}
