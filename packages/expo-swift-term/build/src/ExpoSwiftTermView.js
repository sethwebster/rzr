"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwiftTermView = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const expo_1 = require("expo");
const NativeView = (0, expo_1.requireNativeView)("ExpoSwiftTerm");
exports.SwiftTermView = (0, react_1.forwardRef)(function SwiftTermView(props, ref) {
    // ────────── Feed channel ──────────
    const seqRef = (0, react_1.useRef)(0);
    // bufferRef holds every chunk that hasn't yet been through a React commit.
    // Each flush sends the FULL buffer (not just new entries) so that when
    // React 19 auto-batching collapses multiple setFeedPacket calls into one,
    // the winning value is always a superset of the losers — no chunks lost.
    const bufferRef = (0, react_1.useRef)([]);
    const flushScheduledRef = (0, react_1.useRef)(false);
    const [feedPacket, setFeedPacket] = (0, react_1.useState)(undefined);
    const lastHandedOffSeqRef = (0, react_1.useRef)(0);
    const flush = (0, react_1.useCallback)(() => {
        flushScheduledRef.current = false;
        if (bufferRef.current.length === 0)
            return;
        const snapshot = bufferRef.current.slice();
        lastHandedOffSeqRef.current = snapshot[snapshot.length - 1].s;
        setFeedPacket(JSON.stringify({ chunks: snapshot }));
    }, []);
    const schedule = (0, react_1.useCallback)(() => {
        if (flushScheduledRef.current)
            return;
        flushScheduledRef.current = true;
        Promise.resolve().then(flush);
    }, [flush]);
    (0, react_1.useEffect)(() => {
        if (feedPacket === undefined)
            return;
        const committed = lastHandedOffSeqRef.current;
        bufferRef.current = bufferRef.current.filter((c) => c.s > committed);
    }, [feedPacket]);
    // ────────── Scroll channel ──────────
    // Cumulative total scroll delta in points. JS never needs to know the
    // native `contentOffset` absolute position — the native side diffs each
    // incoming total against its own last-applied total and applies the delta
    // relative to its current `contentOffset`. Idempotent against React
    // auto-batching dropping intermediate setState values.
    const scrollTotalRef = (0, react_1.useRef)(0);
    const scrollSeqRef = (0, react_1.useRef)(0);
    const scrollFlushScheduledRef = (0, react_1.useRef)(false);
    const [scrollPacket, setScrollPacket] = (0, react_1.useState)(undefined);
    const flushScroll = (0, react_1.useCallback)(() => {
        scrollFlushScheduledRef.current = false;
        scrollSeqRef.current += 1;
        setScrollPacket(`${scrollSeqRef.current}:${scrollTotalRef.current}`);
    }, []);
    const scheduleScroll = (0, react_1.useCallback)(() => {
        if (scrollFlushScheduledRef.current)
            return;
        scrollFlushScheduledRef.current = true;
        Promise.resolve().then(flushScroll);
    }, [flushScroll]);
    (0, react_1.useImperativeHandle)(ref, () => ({
        write(data) {
            seqRef.current += 1;
            bufferRef.current.push({ s: seqRef.current, k: "b", d: data });
            schedule();
        },
        writeText(text) {
            seqRef.current += 1;
            bufferRef.current.push({ s: seqRef.current, k: "t", d: text });
            schedule();
        },
        scrollBy(delta) {
            if (!Number.isFinite(delta) || delta === 0)
                return;
            scrollTotalRef.current += delta;
            scheduleScroll();
        },
    }));
    return (0, jsx_runtime_1.jsx)(NativeView, { ...props, feedPacket: feedPacket, scrollPacket: scrollPacket });
});
//# sourceMappingURL=ExpoSwiftTermView.js.map