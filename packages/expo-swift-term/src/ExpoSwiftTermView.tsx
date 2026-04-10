import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { requireNativeView } from "expo";
import type {
  ExpoSwiftTermNativeProps,
  ExpoSwiftTermViewProps,
  ExpoSwiftTermRef,
} from "./ExpoSwiftTerm.types";

const NativeView: ComponentType<ExpoSwiftTermNativeProps & { ref?: any }> =
  requireNativeView("ExpoSwiftTerm");

type PendingChunk = { s: number; k: "t" | "b"; d: string };

export const SwiftTermView = forwardRef<ExpoSwiftTermRef, ExpoSwiftTermViewProps>(
  function SwiftTermView(props, ref) {
    // ────────── Feed channel ──────────
    const seqRef = useRef(0);
    // bufferRef holds every chunk that hasn't yet been through a React commit.
    // Each flush sends the FULL buffer (not just new entries) so that when
    // React 19 auto-batching collapses multiple setFeedPacket calls into one,
    // the winning value is always a superset of the losers — no chunks lost.
    const bufferRef = useRef<PendingChunk[]>([]);
    const flushScheduledRef = useRef(false);
    const [feedPacket, setFeedPacket] = useState<string | undefined>(undefined);
    const lastHandedOffSeqRef = useRef(0);

    const flush = useCallback(() => {
      flushScheduledRef.current = false;
      if (bufferRef.current.length === 0) return;
      const snapshot = bufferRef.current.slice();
      lastHandedOffSeqRef.current = snapshot[snapshot.length - 1].s;
      setFeedPacket(JSON.stringify({ chunks: snapshot }));
    }, []);

    const schedule = useCallback(() => {
      if (flushScheduledRef.current) return;
      flushScheduledRef.current = true;
      Promise.resolve().then(flush);
    }, [flush]);

    useEffect(() => {
      if (feedPacket === undefined) return;
      const committed = lastHandedOffSeqRef.current;
      bufferRef.current = bufferRef.current.filter((c) => c.s > committed);
    }, [feedPacket]);

    // ────────── Scroll channel ──────────
    // Cumulative total scroll delta in points. JS never needs to know the
    // native `contentOffset` absolute position — the native side diffs each
    // incoming total against its own last-applied total and applies the delta
    // relative to its current `contentOffset`. Idempotent against React
    // auto-batching dropping intermediate setState values.
    const scrollTotalRef = useRef(0);
    const scrollSeqRef = useRef(0);
    const scrollFlushScheduledRef = useRef(false);
    const [scrollPacket, setScrollPacket] = useState<string | undefined>(undefined);

    const flushScroll = useCallback(() => {
      scrollFlushScheduledRef.current = false;
      scrollSeqRef.current += 1;
      setScrollPacket(`${scrollSeqRef.current}:${scrollTotalRef.current}`);
    }, []);

    const scheduleScroll = useCallback(() => {
      if (scrollFlushScheduledRef.current) return;
      scrollFlushScheduledRef.current = true;
      Promise.resolve().then(flushScroll);
    }, [flushScroll]);

    useImperativeHandle(ref, () => ({
      write(data: string) {
        seqRef.current += 1;
        bufferRef.current.push({ s: seqRef.current, k: "b", d: data });
        schedule();
      },
      writeText(text: string) {
        seqRef.current += 1;
        bufferRef.current.push({ s: seqRef.current, k: "t", d: text });
        schedule();
      },
      scrollBy(delta: number) {
        if (!Number.isFinite(delta) || delta === 0) return;
        scrollTotalRef.current += delta;
        scheduleScroll();
      },
    }));

    return <NativeView {...props} feedPacket={feedPacket} scrollPacket={scrollPacket} />;
  }
);
