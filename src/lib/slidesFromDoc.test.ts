import type { JSONContent } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import { slidesFromDoc } from './slidesFromDoc';

function heading(level: number, text: string): JSONContent {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

function paragraph(text: string): JSONContent {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

describe('slidesFromDoc', () => {
  it('returns a placeholder slide for an empty document', () => {
    const slides = slidesFromDoc(null);
    expect(slides).toHaveLength(1);
    expect(slides[0].title).toBe('Empty document');
  });

  it('starts a new slide at each H1 and H2', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        heading(1, 'Intro'),
        paragraph('welcome'),
        heading(2, 'Details'),
        paragraph('more'),
      ],
    };
    const slides = slidesFromDoc(doc);
    expect(slides.map((s) => s.title)).toEqual(['Intro', 'Details']);
    expect(slides.map((s) => s.level)).toEqual([1, 2]);
    expect(slides[0].body).toEqual(['welcome']);
    expect(slides[1].body).toEqual(['more']);
  });

  it('folds H3+ headings into the current slide body', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [heading(1, 'Top'), heading(3, 'Sub-point')],
    };
    const slides = slidesFromDoc(doc);
    expect(slides).toHaveLength(1);
    expect(slides[0].body).toEqual(['Sub-point']);
  });

  it('collects content before the first heading under Introduction', () => {
    const doc: JSONContent = { type: 'doc', content: [paragraph('preamble'), heading(1, 'Main')] };
    const slides = slidesFromDoc(doc);
    expect(slides[0].title).toBe('Introduction');
    expect(slides[0].body).toEqual(['preamble']);
  });

  it('renders list items with markers and task state', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        heading(1, 'Tasks'),
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('one')] },
            { type: 'listItem', content: [paragraph('two')] },
          ],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [paragraph('done')],
            },
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [paragraph('todo')],
            },
          ],
        },
      ],
    };
    const slides = slidesFromDoc(doc);
    expect(slides[0].body).toEqual(['• one', '• two', '☑ done', '☐ todo']);
  });

  it('assigns unique ids to repeated titles', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [heading(1, 'Same'), heading(2, 'Same')],
    };
    const ids = slidesFromDoc(doc).map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('keeps math as $...$ source on slides', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        heading(1, 'Math'),
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '辐角 ' },
            { type: 'mathInline', attrs: { tex: '\\theta' } },
            { type: 'text', text: ' 满足' },
          ],
        },
        { type: 'mathBlock', attrs: { tex: 'z = 2' } },
      ],
    };
    // $...$ / $$...$$ source is typeset by the slide renderer (MathLine)
    expect(slidesFromDoc(doc)[0].body).toEqual(['辐角 $\\theta$ 满足', '$$z = 2$$']);
  });

  it('caps body lines at 10 per slide', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [heading(1, 'Long'), ...Array.from({ length: 15 }, (_, i) => paragraph(`l${i}`))],
    };
    expect(slidesFromDoc(doc)[0].body).toHaveLength(10);
  });
});
