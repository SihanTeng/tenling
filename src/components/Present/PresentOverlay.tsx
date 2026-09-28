import { Player, type PlayerRef } from '@remotion/player';
import type { Editor } from '@tiptap/react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { slidesFromDoc } from '../../lib/slidesFromDoc';
import { resolveDark } from '../../lib/theme';
import {
  FRAMES_PER_SLIDE,
  SlideDeck,
  slideDeckDuration,
} from '../../remotion/compositions/SlideDeck';
import { useDocumentStore } from '../../stores/documentStore';

interface Props {
  editor: Editor | null;
  onClose: () => void;
}

// The player is paused during presentation, so land past the slide's enter
// spring (~50 frames at 30fps) instead of on frame 0, where opacity is 0.
const SETTLED_FRAME = 60;

export function PresentOverlay({ editor, onClose }: Props) {
  const theme = useDocumentStore((s) => s.theme);
  const dark = resolveDark(theme);
  const slides = useMemo(() => slidesFromDoc(editor?.getJSON() ?? null), [editor]);
  const durationInFrames = slideDeckDuration(slides.length);
  const [index, setIndex] = useState(0);
  const [player, setPlayer] = useState<PlayerRef | null>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [slideWidth, setSlideWidth] = useState(0);

  useEffect(() => {
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSlideWidth(Math.min(width, (height * 16) / 9, 1024));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);

  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(slides.length - 1, i));
      setIndex(next);
      player?.seekTo(next * FRAMES_PER_SLIDE + SETTLED_FRAME);
    },
    [player, slides.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        goTo(index + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goTo(index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, goTo, onClose]);

  return (
    <div
      className="present-overlay fixed inset-0 z-50 flex flex-col"
      style={{ background: dark ? '#000' : '#111' }}
      role="dialog"
      aria-modal="true"
      aria-label="Presentation"
    >
      <div className="present-controls flex h-10 shrink-0 items-center justify-between px-3 text-white/80">
        <span className="text-[12px] tabular-nums">
          {index + 1} / {slides.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/10"
            onClick={() => goTo(index - 1)}
            title="Previous"
            aria-label="Previous slide"
            disabled={index === 0}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/10"
            onClick={() => goTo(index + 1)}
            title="Next"
            aria-label="Next slide"
            disabled={index === slides.length - 1}
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/10"
            onClick={onClose}
            title="Exit (Esc)"
            aria-label="Exit presentation"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div ref={setStage} className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div
          className="aspect-video shrink-0 overflow-hidden rounded-lg shadow-2xl"
          style={{ width: slideWidth }}
        >
          <Player
            ref={setPlayer}
            component={SlideDeck}
            inputProps={{ slides, dark: true }}
            durationInFrames={durationInFrames}
            compositionWidth={1280}
            compositionHeight={720}
            fps={30}
            initialFrame={SETTLED_FRAME}
            style={{ width: '100%', height: '100%' }}
            controls={false}
            autoPlay={false}
            initiallyShowControls={false}
            acknowledgeRemotionLicense
          />
        </div>
      </div>

      <div className="shrink-0 pb-3 text-center text-[11px] text-white/40">
        ← → navigate · Esc exit
      </div>
    </div>
  );
}
