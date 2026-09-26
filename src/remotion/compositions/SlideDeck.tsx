import katex from 'katex';
import { Fragment } from 'react';
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { splitMathSegments } from '../../lib/markdown/math';
import type { Slide } from '../../lib/slidesFromDoc';

export interface SlideDeckProps {
  slides: Slide[];
  dark?: boolean;
}

const FRAMES_PER_SLIDE = 90;

/** Render a slide line, typesetting $...$ / $$...$$ segments with KaTeX. */
const MathLine: React.FC<{ line: string }> = ({ line }) => {
  const segments = splitMathSegments(line);
  if (segments.every((s) => s.kind === 'text')) return line;
  const seen = new Map<string, number>();
  return segments.map((seg) => {
    // Occurrence-suffixed keys stay unique even when a segment repeats
    const base = `${seg.kind}:${seg.text}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const key = n === 1 ? base : `${base}#${n}`;
    return seg.kind === 'text' ? (
      <Fragment key={key}>{seg.text}</Fragment>
    ) : (
      <span
        key={key}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX generates this markup itself from the document's own TeX source — no HTML is interpolated
        dangerouslySetInnerHTML={{
          __html: katex.renderToString(seg.text, {
            displayMode: seg.display === true,
            throwOnError: false,
          }),
        }}
      />
    );
  });
};

/** Pair body lines with React keys that stay unique even when text repeats. */
function keyedLines(lines: string[]): { key: string; line: string }[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const n = (seen.get(line) ?? 0) + 1;
    seen.set(line, n);
    return { key: n === 1 ? line : `${line}#${n}`, line };
  });
}

const SlideCard: React.FC<{
  slide: Slide;
  dark: boolean;
}> = ({ slide, dark }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 20, stiffness: 100 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const x = interpolate(enter, [0, 1], [28, 0]);

  const bg = dark ? '#111113' : '#fafafa';
  const ink = dark ? '#f5f5f7' : '#1d1d1f';
  const muted = dark ? '#a1a1a6' : '#6e6e73';
  const accent = dark ? '#0a84ff' : '#007aff';

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bg,
        justifyContent: 'center',
        padding: 72,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      }}
    >
      <div style={{ opacity, transform: `translateX(${x}px)`, maxWidth: 900 }}>
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: accent,
            marginBottom: 28,
          }}
        />
        <h1
          style={{
            margin: 0,
            color: ink,
            fontSize: slide.level === 1 ? 56 : 44,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.15,
          }}
        >
          <MathLine line={slide.title} />
        </h1>
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {keyedLines(slide.body).map(({ key, line }) => (
            // div, not p: display-math lines contain block-level KaTeX markup
            <div
              key={key}
              style={{
                margin: 0,
                color: muted,
                fontSize: 24,
                lineHeight: 1.45,
                fontWeight: 400,
              }}
            >
              <MathLine line={line} />
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const SlideDeck: React.FC<SlideDeckProps> = ({ slides, dark = false }) => {
  const list =
    slides.length > 0
      ? slides
      : [
          {
            id: 'no-slides',
            title: 'No slides',
            body: ['Add headings to your document.'],
            level: 1 as const,
          },
        ];

  return (
    <AbsoluteFill>
      {list.map((slide, i) => (
        <Sequence
          key={slide.id}
          from={i * FRAMES_PER_SLIDE}
          durationInFrames={FRAMES_PER_SLIDE}
          name={slide.title}
        >
          <SlideCard slide={slide} dark={dark} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export function slideDeckDuration(slideCount: number): number {
  return Math.max(1, slideCount) * FRAMES_PER_SLIDE;
}

export { FRAMES_PER_SLIDE };
