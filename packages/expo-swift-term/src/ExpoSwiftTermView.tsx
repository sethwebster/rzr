import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { requireNativeView, requireNativeModule } from "expo";
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
    const bufferRef = useRef<PendingChunk[]>([]);
    const flushScheduledRef = useRef(false);
    const [feedPacket, setFeedPacket] = useState<string | undefined>(undefined);
    const lastHandedOffSeqRef = useRef(0);
    const nativeViewRef = useRef<any>(null);

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
      focus() {
        nativeViewRef.current?.focus?.();
      },
      blur() {
        nativeViewRef.current?.blur?.();
      },
    }));

    return (
      <NativeView
        ref={nativeViewRef}
        {...props}
        feedPacket={feedPacket}
      />
    );
  }
);
