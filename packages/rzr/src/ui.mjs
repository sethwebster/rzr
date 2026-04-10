function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderXtermAssetTags(renderer) {
  if (renderer !== "xterm") {
    return "";
  }

  return `
    <link rel="stylesheet" href="/assets/xterm.css" />
    <script src="/assets/xterm.js"></script>
    <script src="/assets/xterm-addon-fit.js"></script>
  `;
}

export function renderIndexHtml({ sessionName, readonly, passwordRequired, renderer = "classic" }) {
  const title = escapeHtml(sessionName);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />
    <title>rzr · ${title}</title>
    ${renderXtermAssetTags(renderer)}
    <script>
      (() => {
        const params = new URLSearchParams(window.location.search);
        const value = (params.get("chrome") || params.get("ui") || params.get("view") || "").toLowerCase();
        const renderer = (params.get("renderer") || ${JSON.stringify(renderer)} || "").toLowerCase();
        const preview = value === "preview";
        const noChrome = value === "0"
          || value === "false"
          || value === "off"
          || value === "minimal"
          || value === "screen"
          || value === "preview"
          || value === "observe"
          || params.get("nochrome") === "1";

        if (noChrome) {
          document.documentElement.classList.add("no-chrome");
        }
        if (preview) {
          document.documentElement.classList.add("preview");
        }
        if (renderer === "xterm") {
          document.documentElement.classList.add("xterm-renderer");
        }
        if (renderer === "mobile-scroll") {
          document.documentElement.classList.add("mobile-scroll-renderer");
        }

        window.__rzrViewConfig = { noChrome, preview, renderer };
      })();
    </script>
    <style>
      :root {
        color-scheme: dark;
        --bg: #070b11;
        --bg-2: #0b111b;
        --panel: rgba(12, 18, 28, 0.92);
        --panel-2: rgba(16, 23, 35, 0.92);
        --panel-3: rgba(20, 28, 42, 0.96);
        --panel-4: rgba(10, 15, 24, 0.88);
        --border: rgba(148, 163, 184, 0.16);
        --border-strong: rgba(148, 163, 184, 0.24);
        --text: #e8eef6;
        --muted: #93a1b4;
        --accent: #4f8cff;
        --accent-strong: #2f81f7;
        --accent-soft: rgba(79, 140, 255, 0.18);
        --success: #2fbf71;
        --success-soft: rgba(47, 191, 113, 0.18);
        --danger: #ff6b6b;
        --danger-soft: rgba(255, 107, 107, 0.16);
        --shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
        --mono: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
        --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        height: 100%;
        min-height: 100vh;
        min-height: 100dvh;
      }

      body {
        overflow: hidden;
        background:
          radial-gradient(circle at top, rgba(79, 140, 255, 0.22), transparent 28%),
          radial-gradient(circle at bottom, rgba(47, 191, 113, 0.09), transparent 24%),
          linear-gradient(180deg, var(--bg-2) 0%, var(--bg) 100%);
        color: var(--text);
        font-family: var(--sans);
      }

      html.no-chrome body {
        background: #05070c;
      }

      button,
      textarea,
      input {
        font: inherit;
      }

      button {
        appearance: none;
        cursor: pointer;
      }

      .app {
        width: 100%;
        height: 100vh;
        height: 100dvh;
      }

      .card {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        background: linear-gradient(180deg, rgba(12, 18, 28, 0.9), rgba(8, 12, 19, 0.98));
        overflow: hidden;
      }

      html.no-chrome .card {
        background: #05070c;
      }

      .header {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        padding:
          calc(14px + env(safe-area-inset-top))
          calc(16px + env(safe-area-inset-right))
          14px
          calc(16px + env(safe-area-inset-left));
        border-bottom: 1px solid var(--border);
        background: rgba(7, 11, 17, 0.68);
        backdrop-filter: blur(18px);
      }

      .title {
        display: grid;
        gap: 4px;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .eyebrow::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--accent), #9fc0ff);
        box-shadow: 0 0 18px rgba(79, 140, 255, 0.65);
      }

      .title h1 {
        margin: 0;
        font-size: 17px;
        line-height: 1.15;
      }

      .title p {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
      }

      .header-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .header-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.04);
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
      }

      .screen-wrap {
        flex: 1 1 auto;
        min-height: 0;
        padding: 0;
      }

      .screen-shell {
        position: relative;
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        overflow: hidden;
      }

      .screen {
        flex: 1 1 auto;
        min-height: 0;
        margin: 0;
        overflow: auto;
        padding: 18px;
        font: 13px/1.45 var(--mono);
        white-space: pre-wrap;
        word-break: break-word;
        overscroll-behavior: contain;
      }

      html.no-chrome .screen-wrap,
      html.no-chrome .screen-shell {
        flex: 1 1 auto;
        height: 100%;
        min-height: 0;
      }

      html.no-chrome .header,
      html.no-chrome .controls {
        display: none;
      }

      html.no-chrome .screen {
        padding:
          calc(10px + env(safe-area-inset-top))
          calc(12px + env(safe-area-inset-right))
          calc(10px + env(safe-area-inset-bottom))
          calc(12px + env(safe-area-inset-left));
        background: #05070c;
      }

      .classic-screen {
        display: block;
      }

      .xterm-screen {
        display: none;
        overflow: hidden;
      }

      .xterm-screen #terminal {
        width: 100%;
        height: 100%;
      }

      .xterm-selection-toolbar {
        position: absolute;
        right: calc(12px + env(safe-area-inset-right));
        bottom: calc(12px + env(safe-area-inset-bottom));
        z-index: 4;
        display: none !important;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.18);
        background: rgba(8, 12, 20, 0.92);
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(18px);
      }

      .xterm-selection-toolbar button {
        min-height: 32px;
        padding: 0 12px;
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        color: rgba(232, 238, 246, 0.92);
        font-size: 12px;
        font-weight: 600;
      }

      .xterm-selection-toolbar button[data-active="true"] {
        border-color: rgba(124, 246, 255, 0.36);
        background: rgba(124, 246, 255, 0.12);
        color: #7cf6ff;
      }

      html.xterm-renderer .classic-screen {
        display: none;
      }

      html.xterm-renderer .header {
        display: none;
      }

      html.xterm-renderer .xterm-screen {
        display: block;
        padding: 0;
        min-height: 0;
      }

      html.xterm-renderer .screen-shell {
        background: #05070c;
      }

      html.xterm-renderer .screen-wrap {
        background: #05070c;
      }

      html.xterm-renderer .xterm-screen #terminal,
      html.xterm-renderer .xterm-screen #terminal .xterm,
      html.xterm-renderer .xterm-screen #terminal .xterm-screen {
        height: 100%;
        min-height: 0;
      }

      html.xterm-renderer .xterm-screen #terminal .xterm {
        overflow: hidden;
      }

      html.no-chrome.xterm-renderer .xterm-screen {
        padding:
          env(safe-area-inset-top)
          env(safe-area-inset-right)
          env(safe-area-inset-bottom)
          env(safe-area-inset-left);
      }

      html.xterm-renderer .xterm .xterm-viewport {
        overflow-y: hidden !important;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        touch-action: none;
      }

      html.xterm-renderer .xterm .xterm-screen canvas {
        pointer-events: none;
      }

      html.mobile-scroll-renderer .screen {
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-y: contain;
        touch-action: pan-y;
      }

      html.preview .screen-wrap,
      html.preview .screen-shell,
      html.preview .screen {
        height: 100%;
        min-height: 100%;
      }

      html.preview .screen {
        padding: 6px 8px;
        font-size: 9px;
        line-height: 1.22;
      }

      .ansi-bold {
        font-weight: 700;
      }

      .ansi-dim {
        opacity: 0.72;
      }

      .ansi-italic {
        font-style: italic;
      }

      .ansi-underline {
        text-decoration: underline;
      }

      .controls {
        position: sticky;
        bottom: 0;
        z-index: 2;
        flex: 0 0 auto;
        display: grid;
        gap: 14px;
        width: 100%;
        padding: 0 0 calc(18px + env(safe-area-inset-bottom));
        border-top: 1px solid rgba(125, 144, 182, 0.14);
        background:
          radial-gradient(circle at top, rgba(89, 132, 255, 0.1), transparent 38%),
          linear-gradient(180deg, rgba(8, 12, 20, 0.9), rgba(7, 10, 16, 0.98));
        backdrop-filter: blur(24px);
        box-shadow: 0 -18px 48px rgba(0, 0, 0, 0.34);
        overflow: auto;
        overscroll-behavior: contain;
      }

      .controls-inner {
        width: 100%;
        margin: 0;
        display: grid;
        gap: 14px;
      }

      .composer-card {
        position: relative;
        display: grid;
        gap: 0;
        width: 100%;
        border: 1px solid rgba(136, 157, 198, 0.18);
        border-right: 0;
        border-left: 0;
        border-bottom: 0;
        border-radius: 18px 18px 0 0;
        overflow: hidden;
        background:
          linear-gradient(180deg, rgba(17, 22, 34, 0.96), rgba(11, 15, 24, 0.96));
        box-shadow:
          0 12px 36px rgba(0, 0, 0, 0.3),
          0 0 0 1px rgba(255, 255, 255, 0.03) inset;
      }

      .composer-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 6px 10px 6px 14px;
        border-bottom: 1px solid rgba(136, 157, 198, 0.12);
        background: rgba(14, 19, 30, 0.6);
        min-height: 32px;
      }

      .composer-toggle {
        appearance: none;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background: transparent;
        border: 0;
        color: rgba(211, 219, 236, 0.82);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        cursor: pointer;
        min-height: 24px;
        min-width: 0;
      }

      .composer-chevron {
        display: inline-block;
        font-size: 10px;
        line-height: 1;
        color: rgba(169, 180, 202, 0.7);
        transition: transform 140ms ease;
      }

      .composer-card[data-collapsed="true"] .composer-chevron {
        transform: rotate(-90deg);
      }

      .composer-card[data-collapsed="true"] .composer-body {
        display: none;
      }

      .composer-card[data-collapsed="true"] .composer-topbar {
        border-bottom: 0;
      }

      .composer-body {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: end;
        gap: 8px;
        padding: 8px 10px 10px;
      }

      .composer-field {
        position: relative;
        border: 1px solid rgba(108, 132, 182, 0.22);
        border-radius: 12px;
        overflow: hidden;
        background: rgba(14, 18, 29, 0.92);
      }

      .composer-state-muted {
        color: rgba(155, 166, 187, 0.72);
        font-weight: 500;
      }

      .composer-body #send.primary {
        min-height: 40px;
        min-width: 72px;
        padding: 0 16px;
        border-radius: 12px;
        font-size: 14px;
        box-shadow:
          0 8px 18px rgba(46, 104, 232, 0.28),
          0 0 14px rgba(86, 154, 255, 0.18);
      }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        padding: 0 18px;
      }

      .toolbar-group {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }

      .toolbar-divider {
        width: 1px;
        align-self: stretch;
        min-height: 44px;
        background: linear-gradient(180deg, transparent, rgba(122, 143, 184, 0.16), transparent);
      }

      .toolbar button {
        min-height: 52px;
        min-width: 96px;
        padding: 0 20px;
        border-radius: 16px;
        border: 1px solid rgba(122, 143, 184, 0.18);
        background:
          linear-gradient(180deg, rgba(23, 29, 43, 0.96), rgba(17, 22, 34, 0.98));
        color: rgba(231, 237, 247, 0.88);
        font-size: 17px;
        font-weight: 650;
        letter-spacing: 0.01em;
        box-shadow:
          0 12px 24px rgba(0, 0, 0, 0.2),
          0 0 0 1px rgba(255, 255, 255, 0.02) inset;
        transition:
          transform 120ms ease,
          border-color 120ms ease,
          background 120ms ease,
          box-shadow 120ms ease;
      }

      .toolbar button.icon {
        min-width: 64px;
        padding: 0 18px;
        font-size: 24px;
        line-height: 1;
      }

      .toolbar button.primary {
        min-width: 178px;
        min-height: 56px;
        border-radius: 15px;
        background: linear-gradient(180deg, #66a8ff 0%, #2f6fe8 100%);
        border-color: rgba(110, 170, 255, 0.84);
        color: #f6f9ff;
        box-shadow:
          0 20px 40px rgba(46, 104, 232, 0.34),
          0 0 24px rgba(86, 154, 255, 0.24);
      }

      .toolbar button.danger {
        border-color: rgba(214, 88, 108, 0.42);
        background: linear-gradient(180deg, rgba(66, 24, 32, 0.96), rgba(35, 17, 22, 0.98));
        color: #f3adb7;
        box-shadow: 0 12px 24px rgba(66, 17, 26, 0.24);
      }

      textarea,
      input {
        width: 100%;
        border-radius: 14px;
        border: 1px solid var(--border-strong);
        background: var(--panel-3);
        color: var(--text);
      }

      textarea {
        min-height: 56px;
        max-height: 28dvh;
        padding: 12px 14px;
        resize: none;
        border: 0;
        border-radius: 0;
        background: transparent;
        font: 15px/1.45 var(--mono);
        color: rgba(229, 235, 245, 0.95);
      }

      input {
        padding: 12px;
        font-size: 14px;
      }

      textarea::placeholder,
      input::placeholder {
        color: color-mix(in srgb, var(--muted) 88%, white 12%);
      }

      textarea:focus,
      input:focus,
      button:focus-visible {
        outline: none;
        border-color: rgba(95, 153, 255, 0.7);
        box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.16);
      }

      .statusbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px 18px;
        min-width: 0;
        padding: 0 18px;
      }

      .status-group {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        min-width: 0;
      }

      .status-group-meta {
        justify-content: flex-end;
        flex: 1 1 320px;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 30px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.04);
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .status-pill-hidden {
        display: none;
      }

      .status-inline {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: rgba(214, 223, 239, 0.9);
        font-size: 14px;
        font-weight: 600;
      }

      .status-inline::before {
        content: "";
        width: 11px;
        height: 11px;
        border-radius: 999px;
        background: linear-gradient(180deg, #6cf59e, #2fbf71);
        box-shadow: 0 0 16px rgba(54, 214, 121, 0.6);
      }

      .status-pill::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.95;
        box-shadow: 0 0 10px currentColor;
      }

      .status-copy {
        color: var(--muted);
        font-size: 13px;
        max-width: 100%;
        overflow-wrap: anywhere;
      }

      .status-copy-quiet {
        color: rgba(157, 168, 189, 0.72);
      }

      .debug-metrics {
        position: absolute;
        right: 14px;
        bottom: 14px;
        z-index: 30;
        min-width: 220px;
        max-width: min(320px, calc(100vw - 28px));
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(148, 163, 184, 0.18);
        background: rgba(7, 11, 17, 0.84);
        box-shadow: 0 16px 42px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(16px);
      }

      .debug-metrics[hidden] {
        display: none;
      }

      .debug-metrics-title {
        margin: 0 0 8px;
        color: rgba(232, 238, 246, 0.92);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .debug-metrics pre {
        margin: 0;
        color: rgba(147, 161, 180, 0.96);
        font: 11px/1.5 var(--mono);
        white-space: pre-wrap;
      }

      .gate {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(6, 10, 16, 0.84);
        backdrop-filter: blur(10px);
        z-index: 10;
      }

      .gate[hidden] {
        display: none;
      }

      .gate-card {
        width: min(100%, 360px);
        display: grid;
        gap: 12px;
        padding: 18px;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: rgba(16, 23, 35, 0.96);
        box-shadow: var(--shadow);
      }

      .gate-card h2,
      .gate-card p {
        margin: 0;
      }

      .gate-card h2 {
        font-size: 16px;
      }

      .gate-card p {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.4;
      }

      .error {
        min-height: 18px;
        color: #ffb0b0;
        font-size: 12px;
      }

      .status-ok {
        color: #7fe3a9;
        border-color: rgba(47, 191, 113, 0.34);
        background: var(--success-soft);
      }

      .status-bad {
        color: #ff9c9c;
        border-color: rgba(255, 107, 107, 0.34);
        background: var(--danger-soft);
      }

      button:disabled,
      textarea:disabled,
      input:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }

      @media (hover: hover) {
        .toolbar button:hover:not(:disabled) {
          transform: translateY(-1px);
          border-color: rgba(173, 191, 229, 0.28);
          background: linear-gradient(180deg, rgba(29, 36, 53, 0.98), rgba(19, 25, 37, 0.98));
        }

        .toolbar button.primary:hover:not(:disabled) {
          background: linear-gradient(180deg, #76b5ff 0%, #3f7ff1 100%);
        }

        .toolbar button.danger:hover:not(:disabled) {
          background: linear-gradient(180deg, rgba(79, 27, 39, 0.96), rgba(43, 19, 27, 0.98));
          border-color: rgba(239, 116, 137, 0.46);
        }
      }

      .toolbar button:active:not(:disabled) {
        transform: translateY(0);
      }

      @media (min-width: 720px) {
        .header {
          padding: 18px 24px 16px;
        }

        .screen {
          padding: 22px 24px;
          font-size: 14px;
        }
      }

      @media (max-width: 719px) {
        .screen {
          flex-basis: 30dvh;
          min-height: 22dvh;
          padding: 14px 16px 12px;
        }

        .controls {
          max-height: 58dvh;
          padding: 0 0 calc(14px + env(safe-area-inset-bottom));
          gap: 14px;
        }

        .controls-inner {
          gap: 14px;
        }

        .composer-card {
          border-radius: 14px 14px 0 0;
        }

        .composer-topbar {
          padding: 6px 8px 6px 12px;
          min-height: 30px;
        }

        .composer-body {
          gap: 8px;
          padding: 6px 8px 8px;
        }

        textarea {
          min-height: 48px;
          max-height: 24dvh;
          padding: 10px 12px;
          font-size: 14px;
          line-height: 1.4;
        }

        .status-copy,
        .status-inline,
        .status-copy-quiet {
          font-size: 12px;
        }

        .toolbar {
          gap: 10px;
          padding: 0 14px;
        }

        .toolbar-group {
          width: 100%;
          gap: 10px;
        }

        .toolbar-group button {
          flex: 1 1 calc(33.333% - 8px);
          min-width: 0;
          min-height: 46px;
          padding: 0 12px;
          font-size: 15px;
        }

        .toolbar-group button.icon {
          flex: 1 1 calc(25% - 8px);
          font-size: 21px;
        }

        .toolbar-divider {
          display: none;
        }

        .statusbar {
          padding: 0 14px;
        }
      }

      button.primary {
        min-height: 54px;
        min-width: 178px;
        padding: 0 28px;
        border-radius: 15px;
        border: 1px solid rgba(110, 170, 255, 0.84);
        background: linear-gradient(180deg, #66a8ff 0%, #2f6fe8 100%);
        color: #f6f9ff;
        font-size: 17px;
        font-weight: 700;
        box-shadow:
          0 20px 40px rgba(46, 104, 232, 0.34),
          0 0 24px rgba(86, 154, 255, 0.24);
      }

      @media (hover: hover) {
        button.primary:hover:not(:disabled) {
          background: linear-gradient(180deg, #76b5ff 0%, #3f7ff1 100%);
        }
      }
    </style>
  </head>
  <body>
    <main class="app">
      <section class="card">
        <section class="gate" id="gate" hidden>
          <form class="gate-card" id="gateForm">
            <h2>Protected Session</h2>
            <p>Enter the password for this remote before the live terminal is exposed.</p>
            <input id="password" type="password" placeholder="Password" autocomplete="current-password" />
            <button class="primary" id="unlock" type="submit">Unlock</button>
            <div class="error" id="gateError"></div>
          </form>
        </section>

        <header class="header">
          <div class="title">
            <span class="eyebrow">rzr remote</span>
            <h1>${title}</h1>
            <p id="subtitle">Connecting…</p>
          </div>
          <div class="header-meta">
            <span class="header-chip">${readonly ? "Read-only relay" : "Live control surface"}</span>
          </div>
        </header>

        <div class="screen-wrap">
          <section class="screen-shell">
            <pre class="screen classic-screen" id="screen"></pre>
            <div class="screen xterm-screen" id="xtermScreen">
              <div id="terminal" aria-label="Live terminal output"></div>
              <div class="xterm-selection-toolbar" id="xtermSelectionToolbar" data-visible="false">
                <button type="button" id="xtermSelectToggle" data-active="false">Select</button>
                <button type="button" id="xtermCopySelection">Copy</button>
                <button type="button" id="xtermClearSelection">Clear</button>
              </div>
            </div>

            <section class="controls">
              <div class="controls-inner">
                <section class="composer-card" id="composerCard" data-collapsed="false">
                  <div class="composer-topbar">
                    <button type="button" class="composer-toggle" id="composerToggle" aria-expanded="true" aria-controls="composerBody">
                      <span class="composer-chevron">▾</span>
                      <span>Composer</span>
                    </button>
                    <span class="status-copy status-copy-quiet" id="sessionState">${readonly ? "Read-only" : "Interactive"}</span>
                  </div>

                  <div class="composer-body" id="composerBody">
                    <div class="composer-field">
                      <textarea
                        id="composer"
                        placeholder="Type commands or paste text…"
                        data-interactive-control
                        rows="1"
                        ${readonly ? "disabled" : ""}
                      ></textarea>
                    </div>
                    <button class="primary" id="send" data-interactive-control ${readonly ? "disabled" : ""}>Send</button>
                  </div>
                </section>

                <div class="toolbar" aria-label="Terminal controls">
                  <div class="toolbar-group">
                    <button id="pasteOnly" data-interactive-control ${readonly ? "disabled" : ""}>Paste</button>
                    <button id="tab" data-interactive-control ${readonly ? "disabled" : ""}>Tab</button>
                    <button id="esc" data-interactive-control ${readonly ? "disabled" : ""}>Esc</button>
                  </div>
                  <div class="toolbar-divider"></div>
                  <div class="toolbar-group">
                    <button class="icon" id="left" data-interactive-control ${readonly ? "disabled" : ""}>←</button>
                    <button class="icon" id="up" data-interactive-control ${readonly ? "disabled" : ""}>↑</button>
                    <button class="icon" id="right" data-interactive-control ${readonly ? "disabled" : ""}>→</button>
                  </div>
                  <div class="toolbar-divider"></div>
                  <div class="toolbar-group">
                    <button class="danger" id="ctrlc" data-interactive-control ${readonly ? "disabled" : ""}>Ctrl+C</button>
                    <button id="ctrld" data-interactive-control ${readonly ? "disabled" : ""}>Ctrl+D</button>
                    <button id="enter" data-interactive-control ${readonly ? "disabled" : ""}>Enter</button>
                    <button class="danger" id="restart" hidden>Restart</button>
                  </div>
                </div>

                <div class="statusbar">
                  <div class="status-group">
                    <span class="status-inline" id="footerState">${readonly ? "Read-only" : "Interactive"}</span>
                    <span class="status-pill status-bad status-pill-hidden" id="conn">offline</span>
                    <span class="status-pill status-bad status-pill-hidden" id="proc">loading</span>
                    <span class="status-pill status-bad status-pill-hidden" id="idle">idle</span>
                    <span class="status-pill status-ok status-pill-hidden" id="prompt">prompt</span>
                    <span class="status-pill ${readonly ? "status-bad" : "status-ok"} status-pill-hidden">${readonly ? "read only" : "interactive"}</span>
                  </div>
                  <div class="status-group status-group-meta">
                    <span class="status-copy status-copy-quiet" id="footerMeta">${readonly ? "Viewing only." : "Interactive tmux session attached."}</span>
                  </div>
                </div>

                <aside class="debug-metrics" id="debugMetrics" hidden>
                  <div class="debug-metrics-title">stream metrics</div>
                  <pre id="debugMetricsText"></pre>
                </aside>
              </div>
            </section>
          </section>
        </div>
      </section>
    </main>

    <script>
      const readonly = ${readonly ? "true" : "false"};
      const passwordRequired = ${passwordRequired ? "true" : "false"};
      const viewConfig = window.__rzrViewConfig || { noChrome: false, preview: false };
      const lowChurnRenderMode = Boolean(viewConfig.preview);
      const useXtermRenderer = viewConfig.renderer === "xterm";
      const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const searchParams = new URLSearchParams(window.location.search);
      const debugMetricsEnabled = ["1", "true", "yes", "on"].includes((searchParams.get("debug") || searchParams.get("metrics") || "").toLowerCase());
      const textEncoder = debugMetricsEnabled ? new TextEncoder() : null;
      const token = searchParams.get("token") || "";
      const screen = document.getElementById("screen");
      const terminalMount = document.getElementById("terminal");
      const xtermSelectionToolbar = document.getElementById("xtermSelectionToolbar");
      const xtermSelectToggle = document.getElementById("xtermSelectToggle");
      const xtermCopySelection = document.getElementById("xtermCopySelection");
      const xtermClearSelection = document.getElementById("xtermClearSelection");
      const subtitle = document.getElementById("subtitle");
      const conn = document.getElementById("conn");
      const proc = document.getElementById("proc");
      const idle = document.getElementById("idle");
      const prompt = document.getElementById("prompt");
      const sessionState = document.getElementById("sessionState");
      const footerState = document.getElementById("footerState");
      const footerMeta = document.getElementById("footerMeta");
      const composer = document.getElementById("composer");
      const composerCard = document.getElementById("composerCard");
      const composerToggle = document.getElementById("composerToggle");
      const send = document.getElementById("send");
      const pasteOnly = document.getElementById("pasteOnly");
      const restart = document.getElementById("restart");
      const gate = document.getElementById("gate");
      const gateForm = document.getElementById("gateForm");
      const passwordField = document.getElementById("password");
      const gateError = document.getElementById("gateError");
      const debugMetricsPanel = document.getElementById("debugMetrics");
      const debugMetricsText = document.getElementById("debugMetricsText");
      const interactiveControls = Array.from(document.querySelectorAll("[data-interactive-control]"));
      const fitAddonCtor = window.FitAddon && window.FitAddon.FitAddon ? window.FitAddon.FitAddon : null;
      let events = null;
      let terminalSocket = null;
      let terminalSocketManualClose = false;
      let terminalSocketReconnectTimer = null;
      let pollTimer = null;
      let lastSnapshotRevision = -1;
      let lastLiveEventAt = 0;
      let lastRenderedScreen = "";
      let lastRenderedPlainScreen = "";
      let lastRenderedAnsiStyle = defaultAnsiStyle();
      let terminal = null;
      let fitAddon = null;
      let resizeObserver = null;
      let resizeRaf = 0;
      let lastResizeSignature = "";
      let terminalViewport = null;
      let terminalTouchState = null;
      let terminalSelectionMode = false;
      let terminalSelectionAnchorLine = null;
      let authToken = searchParams.get("auth") || "";
      let restarting = false;
      let transportObserverMode = false;
      let transportObserverMessage = "";
      let connectionState = { label: "offline", ok: false };
      let processState = { label: "loading", ok: false };
      let signalState = { idle: false, prompt: false, promptText: "" };
      let pendingVisibleUpdateAt = 0;
      const debugMetrics = {
        streamOpens: 0,
        streamErrors: 0,
        pollFallbacks: 0,
        snapshots: 0,
        appendPatches: 0,
        fullRepaints: 0,
        lastSnapshotBytes: 0,
        lastSnapshotGapMs: null,
        lastRenderMs: null,
        lastVisibleLatencyMs: null,
        xtermLayout: null,
      };
      let lastRenderEndedAt = 0;
      const apiBaseUrl = (() => {
        const pathname = window.location.pathname.endsWith("/")
          ? window.location.pathname
          : window.location.pathname + "/";
        return new URL(pathname, window.location.origin);
      })();

      function apiUrl(path) {
        let normalized = String(path || "");
        while (normalized.startsWith("/")) {
          normalized = normalized.slice(1);
        }
        return new URL(normalized, apiBaseUrl);
      }

      function terminalWebSocketUrl() {
        const url = apiUrl("api/terminal/ws");
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        url.searchParams.set("token", token);
        if (authToken) {
          url.searchParams.set("auth", authToken);
        }
        return url.toString();
      }

      function updateDebugMetrics() {
        if (!debugMetricsEnabled || !debugMetricsPanel || !debugMetricsText) {
          return;
        }

        const xtermLayout = debugMetrics.xtermLayout;
        debugMetricsPanel.hidden = false;
        const lines = [
          "stream opens: " + debugMetrics.streamOpens,
          "stream errors: " + debugMetrics.streamErrors,
          "poll fallbacks: " + debugMetrics.pollFallbacks,
          "snapshots: " + debugMetrics.snapshots,
          "append patches: " + debugMetrics.appendPatches,
          "full repaints: " + debugMetrics.fullRepaints,
          "snapshot bytes: " + debugMetrics.lastSnapshotBytes,
          "snapshot gap: " + (debugMetrics.lastSnapshotGapMs == null ? "—" : Math.round(debugMetrics.lastSnapshotGapMs) + "ms"),
          "render: " + (debugMetrics.lastRenderMs == null ? "—" : debugMetrics.lastRenderMs.toFixed(1) + "ms"),
          "input→paint: " + (debugMetrics.lastVisibleLatencyMs == null ? "—" : Math.round(debugMetrics.lastVisibleLatencyMs) + "ms"),
          xtermLayout ? "terminal box: " + xtermLayout.mountHeight + "h/" + xtermLayout.mountTop + "t" : "terminal box: —",
          xtermLayout ? "xterm box: " + xtermLayout.xtermHeight + "h screen=" + xtermLayout.screenHeight + " viewport=" + xtermLayout.viewportHeight : "xterm box: —",
          xtermLayout ? "viewport scroll: top=" + xtermLayout.viewportScrollTop + " height=" + xtermLayout.viewportScrollHeight : "viewport scroll: —",
          xtermLayout ? "rows/cols: " + xtermLayout.rows + "x" + xtermLayout.cols + " viewportY=" + xtermLayout.viewportY : "rows/cols: —",
          xtermLayout ? "window: inner=" + xtermLayout.windowInnerHeight + " visual=" + xtermLayout.visualViewportHeight : "window: —",
        ];
        debugMetricsText.textContent = lines.join("\\n");
      }

      function roundMetric(value) {
        return Number.isFinite(value) ? Math.round(value) : 0;
      }

      function collectXtermLayoutMetrics() {
        if (!debugMetricsEnabled || !useXtermRenderer || !terminalMount) {
          return;
        }

        const mountRect = terminalMount.getBoundingClientRect();
        const xtermRoot = terminalMount.querySelector(".xterm");
        const xtermScreenNode = terminalMount.querySelector(".xterm-screen");
        const viewportNode = terminalMount.querySelector(".xterm-viewport");
        const scrollAreaNode = terminalMount.querySelector(".xterm-scroll-area");

        debugMetrics.xtermLayout = {
          mountTop: roundMetric(mountRect.top),
          mountHeight: roundMetric(mountRect.height),
          xtermHeight: roundMetric(xtermRoot?.getBoundingClientRect?.().height || 0),
          screenHeight: roundMetric(xtermScreenNode?.getBoundingClientRect?.().height || 0),
          viewportHeight: roundMetric(viewportNode?.getBoundingClientRect?.().height || 0),
          viewportScrollTop: roundMetric(viewportNode?.scrollTop || 0),
          viewportScrollHeight: roundMetric(viewportNode?.scrollHeight || 0),
          scrollAreaHeight: roundMetric(scrollAreaNode?.getBoundingClientRect?.().height || 0),
          rows: Number(terminal?.rows || 0),
          cols: Number(terminal?.cols || 0),
          viewportY: Number(terminal?.buffer?.active?.viewportY || 0),
          windowInnerHeight: roundMetric(window.innerHeight || 0),
          visualViewportHeight: roundMetric(window.visualViewport?.height || 0),
        };

        window.__rzrXtermLayout = debugMetrics.xtermLayout;
      }

      function isMobileSelectionSupported() {
        return useXtermRenderer && isTouchDevice;
      }

      function setTerminalSelectionMode(active) {
        terminalSelectionMode = Boolean(active);
        if (!terminalSelectionMode) {
          terminalSelectionAnchorLine = null;
        }
        if (xtermSelectionToolbar) {
          xtermSelectionToolbar.dataset.visible = isMobileSelectionSupported() ? "true" : "false";
        }
        if (xtermSelectToggle) {
          xtermSelectToggle.dataset.active = terminalSelectionMode ? "true" : "false";
          xtermSelectToggle.textContent = terminalSelectionMode ? "Selecting…" : "Select";
        }
      }

      function clearTerminalSelection() {
        terminalSelectionAnchorLine = null;
        terminal?.clearSelection();
        setTerminalSelectionMode(false);
      }

      function getTerminalLineFromTouch(clientY) {
        if (!terminalViewport || !terminal) {
          return 0;
        }
        const rect = terminalViewport.getBoundingClientRect();
        const relativeY = Math.max(0, clientY - rect.top);
        const cellHeight = terminalViewport.clientHeight && terminal.rows
          ? Math.max(1, terminalViewport.clientHeight / Math.max(terminal.rows, 1))
          : 18;
        const viewportOffset = Math.floor(relativeY / cellHeight);
        const maxVisibleOffset = Math.max(0, terminal.rows - 1);
        return Math.max(0, terminal.buffer.active.viewportY + Math.min(maxVisibleOffset, viewportOffset));
      }

      async function copyTerminalSelection() {
        if (!terminal || !terminal.hasSelection()) {
          return;
        }
        const value = terminal.getSelection();
        if (!value) {
          return;
        }
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            __rzrTerminalCopy: true,
            text: value,
          }));
          return;
        }
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        }
      }

      function ensureTerminal() {
        if (!useXtermRenderer || terminal || !terminalMount || !window.Terminal) {
          return terminal;
        }

        terminal = new window.Terminal({
          allowTransparency: true,
          convertEol: true,
          cursorBlink: true,
          cursorStyle: "bar",
          disableStdin: readonly || document.documentElement.classList.contains("no-chrome"),
          fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace',
          fontSize: 13,
          lineHeight: 1.32,
          scrollback: 10000,
          theme: {
            background: "#05070c",
            foreground: "#e8eef6",
            cursor: "#7cf6ff",
            selectionBackground: "rgba(124, 246, 255, 0.18)",
          },
        });

        if (fitAddonCtor) {
          fitAddon = new fitAddonCtor();
          terminal.loadAddon(fitAddon);
        }

        if (!readonly && !document.documentElement.classList.contains("no-chrome")) {
          terminal.onData((data) => {
            if (!data) return;
            if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
              terminalSocket.send(JSON.stringify({ type: "input", text: data }));
            }
          });
        }

        terminal.open(terminalMount);
        fitAddon?.fit();
        attachTerminalTouchScroll();
        window.__rzrHandleInsetsChanged = scheduleTerminalResize;
        collectXtermLayoutMetrics();
        requestAnimationFrame(() => {
          scheduleTerminalResize();
        });
        setTimeout(() => {
          scheduleTerminalResize();
        }, 50);
        setTimeout(() => {
          scheduleTerminalResize();
        }, 250);
        setTerminalSelectionMode(false);
        return terminal;
      }

      function attachTerminalTouchScroll() {
        if (!useXtermRenderer || !terminalMount || terminalViewport) {
          return;
        }

        terminalViewport = terminalMount.querySelector(".xterm-viewport");
        if (!terminalViewport) {
          return;
        }

        const getCellHeight = () => {
          if (terminalViewport && terminal && terminal.rows) {
            return Math.max(1, terminalViewport.clientHeight / Math.max(terminal.rows, 1));
          }
          return 18;
        };

        const isInsideTerminal = (event) => {
          const touchTarget = event.target;
          return Boolean(touchTarget && terminalMount.contains(touchTarget));
        };

        const handleTouchStart = (event) => {
          if (!isInsideTerminal(event)) {
            terminalTouchState = null;
            return;
          }

          if (!event.touches || event.touches.length !== 1) {
            terminalTouchState = null;
            return;
          }

          terminalTouchState = {
            lastY: event.touches[0].clientY,
            residualY: 0,
          };

          if (terminalSelectionMode) {
            const line = getTerminalLineFromTouch(event.touches[0].clientY);
            terminalSelectionAnchorLine = line;
            terminal?.selectLines(line, line);
          }
        };

        const handleTouchMove = (event) => {
          if (!isInsideTerminal(event)) {
            return;
          }

          if (!terminalTouchState || !event.touches || event.touches.length !== 1) {
            return;
          }

          const nextY = event.touches[0].clientY;

          if (terminalSelectionMode) {
            const line = getTerminalLineFromTouch(nextY);
            const anchor = terminalSelectionAnchorLine == null ? line : terminalSelectionAnchorLine;
            terminal?.selectLines(Math.min(anchor, line), Math.max(anchor, line));
            event.preventDefault();
            return;
          }
        };

        const clearTouchState = () => {
          terminalTouchState = null;
        };

        document.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
        document.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true });
        document.addEventListener("touchend", clearTouchState, { passive: true, capture: true });
        document.addEventListener("touchcancel", clearTouchState, { passive: true, capture: true });
      }

      async function syncTerminalSize() {
        if (!useXtermRenderer) {
          return;
        }

        const instance = ensureTerminal();
        if (!instance) {
          return;
        }

        fitAddon?.fit();

        const cols = Number(instance.cols || 0);
        const rows = Number(instance.rows || 0);
        collectXtermLayoutMetrics();
        updateDebugMetrics();
        if (!cols || !rows) {
          return;
        }

        if (readonly) {
          return;
        }

        const signature = cols + "x" + rows;
        if (signature === lastResizeSignature) {
          return;
        }

        lastResizeSignature = signature;

        try {
          if (useXtermRenderer) {
            if (terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
              terminalSocket.send(JSON.stringify({
                type: "resize",
                cols,
                rows,
              }));
            }
            return;
          }

          const response = await post("api/resize", { cols, rows });
          const payload = await response.json();
          if (payload.snapshot) {
            renderSnapshot(payload.snapshot);
          }
        } catch {
        }
      }

      function scheduleTerminalResize() {
        if (!useXtermRenderer) {
          return;
        }

        if (resizeRaf) {
          cancelAnimationFrame(resizeRaf);
        }

        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = 0;
          syncTerminalSize();
        });
      }

      function attachTerminalResizeObserver() {
        if (!useXtermRenderer || resizeObserver || !window.ResizeObserver || !terminalMount) {
          return;
        }

        resizeObserver = new ResizeObserver(() => {
          scheduleTerminalResize();
        });
        resizeObserver.observe(terminalMount);
      }

      function setConn(label, ok) {
        connectionState = { label, ok };
        conn.textContent = label;
        conn.className = "status-pill " + (ok ? "status-ok" : "status-bad");
        updateStatusSummary();
      }

      function setProc(label, ok) {
        processState = { label, ok };
        proc.textContent = label;
        proc.className = "status-pill " + (ok ? "status-ok" : "status-bad");
        updateStatusSummary();
      }

      function setSignalPill(node, label, active, ok = true) {
        if (!node) return;
        node.textContent = label;
        node.className = "status-pill " + (ok ? "status-ok" : "status-bad") + (active ? "" : " status-pill-hidden");
      }

      function setInteractiveControlsEnabled(enabled) {
        const allowInteraction = enabled && !readonly && !restarting && !transportObserverMode;
        interactiveControls.forEach((node) => {
          node.disabled = !allowInteraction;
        });
      }

      function setRestartVisible(visible) {
        if (!restart) {
          return;
        }

        restart.hidden = !visible;
        restart.disabled = restarting;
        restart.textContent = restarting ? "Restarting…" : "Restart";
      }

      function updateStatusSummary() {
        const connected = connectionState.ok;
        const live = processState.ok;
        const dead = processState.label === "exited";
        const missing = processState.label === "missing";
        let topText = "";
        let bottomText = "";

        if (readonly) {
          topText = live ? "Read-only · tmux session attached" : "Read-only · waiting for session";
          bottomText = connected ? "Read-only viewer connected." : "Read-only viewer reconnecting.";
        } else if (transportObserverMode) {
          topText = "Observe · live terminal active elsewhere";
          bottomText = transportObserverMessage || "Live terminal is active on another device.";
        } else if (live && connected) {
          topText = "Interactive · tmux session attached";
          bottomText = "Interactive session live.";
        } else if (live) {
          topText = "Interactive · reconnecting to tmux session";
          bottomText = "Session is live. Reconnecting transport.";
        } else if (processState.label === "missing") {
          topText = "Missing · tmux session detached";
          bottomText = "Attached tmux session could not be found.";
        } else if (processState.label === "exited") {
          topText = "Exited · wrapped process finished";
          bottomText = "The wrapped process has exited.";
        } else {
          topText = "Connecting · tmux session pending";
          bottomText = "Waiting for the live bridge.";
        }

        if (signalState.prompt) {
          bottomText = signalState.promptText || "Terminal is waiting for input.";
        } else if (signalState.idle && live) {
          bottomText = "Session is idle.";
        }

        if (sessionState) {
          const parts = topText.split(" · ");
          if (parts.length > 1) {
            sessionState.innerHTML = escapeHtml(parts[0]) + ' · <span class="composer-state-muted">' + escapeHtml(parts.slice(1).join(" · ")) + "</span>";
          } else {
            sessionState.textContent = topText;
          }
        }

        if (footerState) {
          footerState.textContent = readonly
            ? "Read-only"
            : transportObserverMode
              ? "Observe"
            : dead
              ? "Exited"
              : missing
                ? "Missing"
                : live
                  ? "Interactive"
                  : "Connecting";
        }

        if (footerMeta) {
          footerMeta.textContent = bottomText;
        }

        setSignalPill(idle, "idle", signalState.idle, false);
        setSignalPill(prompt, "input", signalState.prompt, true);
        setInteractiveControlsEnabled(!dead && !missing);
        setRestartVisible(!readonly && dead);
      }

      function clearComposer() {
        composer.value = "";
      }

      function setGateVisible(visible, error = "") {
        gate.hidden = !visible;
        gateError.textContent = error;

        if (visible) {
          setConn("locked", false);
          subtitle.textContent = "Password required";
          setProc("locked", false);
          passwordField.focus();
        }
      }

      async function post(path, body) {
        const response = await fetch(apiUrl(path), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-rzr-token": token,
            ...(authToken ? { "x-rzr-auth": authToken } : {}),
          },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          let message = response.statusText;

          try {
            const payload = await response.json();
            message = payload.error || message;
          } catch {
            message = await response.text() || message;
          }

          throw new Error(message);
        }

        return response;
      }

      async function readSessionPayload(response) {
        const raw = await response.text();
        if (!raw) {
          return null;
        }

        try {
          return JSON.parse(raw);
        } catch {
          return { error: raw };
        }
      }

      async function pasteText(value) {
        if (!value) {
          return;
        }

        pendingVisibleUpdateAt = window.performance?.now?.() ?? Date.now();
        if (useXtermRenderer && terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
          terminalSocket.send(JSON.stringify({ type: "input", text: value }));
          return;
        }

        const response = await post("api/input", { text: value });
        const payload = await response.json();
        if (payload.snapshot) {
          renderSnapshot(payload.snapshot);
        }
      }

      async function pressKey(key) {
        pendingVisibleUpdateAt = window.performance?.now?.() ?? Date.now();
        if (useXtermRenderer && terminalSocket && terminalSocket.readyState === WebSocket.OPEN) {
          terminalSocket.send(JSON.stringify({ type: "key", key }));
          return;
        }

        const response = await post("api/key", { key });
        const payload = await response.json();
        if (payload.snapshot) {
          renderSnapshot(payload.snapshot);
        }
      }

      async function pasteAndEnter(value) {
        if (value) {
          await pasteText(value);
        }

        await pressKey("Enter");
      }

      function scrollTerminal(lines) {
        const instance = ensureTerminal();
        if (!instance || !Number.isFinite(lines) || lines === 0) {
          return;
        }

        instance.scrollLines(lines);
      }

      function scrollTerminalPage(direction) {
        const instance = ensureTerminal();
        if (!instance) {
          return;
        }

        const pageLines = Math.max(4, Math.floor((instance.rows || 24) * 0.85));
        scrollTerminal((direction < 0 ? -1 : 1) * pageLines);
      }

      function maybeStickToBottom(beforeHeight) {
        const nearBottom = screen.scrollTop + screen.clientHeight >= beforeHeight - 32;
        if (nearBottom) {
          screen.scrollTop = screen.scrollHeight;
        }
      }

      function escapeHtml(value) {
        return value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      }

      function xtermColor(index) {
        const base = [
          "#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0",
          "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
        ];

        if (index < 16) {
          return base[index];
        }

        if (index >= 16 && index <= 231) {
          const value = index - 16;
          const red = Math.floor(value / 36);
          const green = Math.floor((value % 36) / 6);
          const blue = value % 6;
          const steps = [0, 95, 135, 175, 215, 255];
          return "rgb(" + steps[red] + "," + steps[green] + "," + steps[blue] + ")";
        }

        const gray = 8 + ((index - 232) * 10);
        return "rgb(" + gray + "," + gray + "," + gray + ")";
      }

      function cloneStyle(style) {
        return {
          fg: style.fg,
          bg: style.bg,
          bold: style.bold,
          dim: style.dim,
          italic: style.italic,
          underline: style.underline,
          inverse: style.inverse,
        };
      }

      function defaultAnsiStyle() {
        return {
          fg: "",
          bg: "",
          bold: false,
          dim: false,
          italic: false,
          underline: false,
          inverse: false,
        };
      }

      function styleToMarkup(style) {
        const classes = [];
        const declarations = [];
        let foreground = style.fg;
        let background = style.bg;

        if (style.inverse) {
          foreground = style.bg || "var(--bg)";
          background = style.fg || "var(--text)";
        }

        if (foreground) {
          declarations.push("color:" + foreground);
        }

        if (background) {
          declarations.push("background-color:" + background);
        }

        if (style.bold) {
          classes.push("ansi-bold");
        }

        if (style.dim) {
          classes.push("ansi-dim");
        }

        if (style.italic) {
          classes.push("ansi-italic");
        }

        if (style.underline) {
          classes.push("ansi-underline");
        }

        return {
          className: classes.join(" "),
          style: declarations.join(";"),
        };
      }

      function applyAnsiCodes(style, codes) {
        if (codes.length === 0) {
          return defaultAnsiStyle();
        }

        const next = cloneStyle(style);

        for (let index = 0; index < codes.length; index += 1) {
          const code = Number(codes[index]);

          if (Number.isNaN(code)) {
            continue;
          }

          if (code === 0) {
            Object.assign(next, defaultAnsiStyle());
          } else if (code === 1) {
            next.bold = true;
          } else if (code === 2) {
            next.dim = true;
          } else if (code === 3) {
            next.italic = true;
          } else if (code === 4) {
            next.underline = true;
          } else if (code === 7) {
            next.inverse = true;
          } else if (code === 22) {
            next.bold = false;
            next.dim = false;
          } else if (code === 23) {
            next.italic = false;
          } else if (code === 24) {
            next.underline = false;
          } else if (code === 27) {
            next.inverse = false;
          } else if (code === 39) {
            next.fg = "";
          } else if (code === 49) {
            next.bg = "";
          } else if (code >= 30 && code <= 37) {
            next.fg = xtermColor(code - 30);
          } else if (code >= 40 && code <= 47) {
            next.bg = xtermColor(code - 40);
          } else if (code >= 90 && code <= 97) {
            next.fg = xtermColor(code - 82);
          } else if (code >= 100 && code <= 107) {
            next.bg = xtermColor(code - 92);
          } else if ((code === 38 || code === 48) && codes[index + 1] === "5" && codes[index + 2] != null) {
            const color = xtermColor(Number(codes[index + 2]));
            if (code === 38) {
              next.fg = color;
            } else {
              next.bg = color;
            }
            index += 2;
          } else if ((code === 38 || code === 48) && codes[index + 1] === "2" && codes[index + 4] != null) {
            const red = Number(codes[index + 2]);
            const green = Number(codes[index + 3]);
            const blue = Number(codes[index + 4]);
            const color = "rgb(" + red + "," + green + "," + blue + ")";
            if (code === 38) {
              next.fg = color;
            } else {
              next.bg = color;
            }
            index += 4;
          }
        }

        return next;
      }

      function renderAnsiFragment(text, initialStyle = defaultAnsiStyle()) {
        const sgrPattern = /\\u001b\\[([0-9;]*)m/g;
        const oscPattern = /\\u001b\\][^\\u0007]*(\\u0007|\\u001b\\\\)/g;
        let cursor = 0;
        let style = cloneStyle(initialStyle);
        let html = "";
        let match;

        while ((match = sgrPattern.exec(text)) !== null) {
          const chunk = text.slice(cursor, match.index);
          if (chunk) {
            const markup = styleToMarkup(style);
            const classAttribute = markup.className ? ' class="' + markup.className + '"' : "";
            const styleAttribute = markup.style ? ' style="' + markup.style + '"' : "";
            html += "<span" + classAttribute + styleAttribute + ">" + escapeHtml(chunk) + "</span>";
          }

          const codes = match[1] ? match[1].split(";") : [];
          style = applyAnsiCodes(style, codes);
          cursor = match.index + match[0].length;
        }

        const tail = text.slice(cursor).replace(oscPattern, "");
        if (tail) {
          const markup = styleToMarkup(style);
          const classAttribute = markup.className ? ' class="' + markup.className + '"' : "";
          const styleAttribute = markup.style ? ' style="' + markup.style + '"' : "";
          html += "<span" + classAttribute + styleAttribute + ">" + escapeHtml(tail) + "</span>";
        }

        return {
          html,
          finalStyle: cloneStyle(style),
        };
      }

      function renderSnapshot(snapshot) {
        if (typeof snapshot.revision === "number" && snapshot.revision <= lastSnapshotRevision) {
          return;
        }

        lastSnapshotRevision = typeof snapshot.revision === "number" ? snapshot.revision : lastSnapshotRevision;
        const renderStartedAt = window.performance?.now?.() ?? Date.now();
        const nextScreen = snapshot.screen || "";
        const beforeHeight = screen.scrollHeight;
        if (useXtermRenderer) {
          const instance = ensureTerminal();
          const canAppendTail =
            lastRenderedScreen.length > 0
            && nextScreen.startsWith(lastRenderedScreen)
            && !nextScreen.slice(lastRenderedScreen.length).includes("\\r");

          if (instance) {
            if (canAppendTail) {
              instance.write(nextScreen.slice(lastRenderedScreen.length));
              debugMetrics.appendPatches += 1;
            } else if (nextScreen !== lastRenderedScreen) {
              instance.reset();
              instance.clear();
              instance.write("\\u001b[2J\\u001b[H" + nextScreen);
              debugMetrics.fullRepaints += 1;
            }
          } else {
            screen.textContent = stripAnsi(nextScreen);
            debugMetrics.fullRepaints += 1;
          }
        } else if (lowChurnRenderMode) {
          const nextPlainScreen = stripAnsi(nextScreen);
          const canAppendTail =
            lastRenderedPlainScreen.length > 0
            && nextPlainScreen.startsWith(lastRenderedPlainScreen)
            && !nextPlainScreen.slice(lastRenderedPlainScreen.length).includes("\\r");

          if (canAppendTail) {
            screen.textContent += nextPlainScreen.slice(lastRenderedPlainScreen.length);
            debugMetrics.appendPatches += 1;
          } else if (nextPlainScreen !== lastRenderedPlainScreen) {
            screen.textContent = nextPlainScreen;
            debugMetrics.fullRepaints += 1;
          }

          lastRenderedPlainScreen = nextPlainScreen;
        } else {
          const canAppendTail =
            lastRenderedScreen.length > 0
            && nextScreen.startsWith(lastRenderedScreen)
            && !nextScreen.slice(lastRenderedScreen.length).includes("\\r");

          if (canAppendTail) {
            const tail = nextScreen.slice(lastRenderedScreen.length);
            const renderedTail = renderAnsiFragment(tail, lastRenderedAnsiStyle);
            screen.insertAdjacentHTML("beforeend", renderedTail.html);
            lastRenderedAnsiStyle = renderedTail.finalStyle;
            debugMetrics.appendPatches += 1;
          } else if (nextScreen !== lastRenderedScreen) {
            const renderedScreen = renderAnsiFragment(nextScreen);
            screen.innerHTML = renderedScreen.html;
            lastRenderedAnsiStyle = renderedScreen.finalStyle;
            debugMetrics.fullRepaints += 1;
          }
        }

        lastRenderedScreen = nextScreen;
        if (!useXtermRenderer) {
          maybeStickToBottom(beforeHeight);
        }
        debugMetrics.snapshots += 1;
        if (textEncoder) {
          debugMetrics.lastSnapshotBytes = textEncoder.encode(nextScreen).length;
        }
        if (lastRenderEndedAt) {
          debugMetrics.lastSnapshotGapMs = Date.now() - lastRenderEndedAt;
        }
        if (pendingVisibleUpdateAt) {
          debugMetrics.lastVisibleLatencyMs = (window.performance?.now?.() ?? Date.now()) - pendingVisibleUpdateAt;
          pendingVisibleUpdateAt = 0;
        }
        debugMetrics.lastRenderMs = (window.performance?.now?.() ?? Date.now()) - renderStartedAt;
        lastRenderEndedAt = Date.now();
        updateDebugMetrics();

        const dead = Boolean(snapshot.info && snapshot.info.dead);
        const missing = Boolean(snapshot.info && snapshot.info.missing);
        const title = snapshot.info && snapshot.info.title ? " · " + snapshot.info.title : "";
        signalState = {
          idle: Boolean(snapshot.signals && snapshot.signals.idle && snapshot.signals.idle.isIdle),
          prompt: Boolean(snapshot.signals && snapshot.signals.input && snapshot.signals.input.waiting),
          promptText:
            snapshot.signals && snapshot.signals.input && snapshot.signals.input.prompt
              ? snapshot.signals.input.prompt
              : "",
        };
        subtitle.textContent = (snapshot.info ? snapshot.info.currentCommand : "session") + title;
        setProc(missing ? "missing" : dead ? "exited" : "live", !dead && !missing);
      }

      async function pollSession() {
        try {
          const response = await fetch(apiUrl("api/session"), {
            headers: {
              "x-rzr-token": token,
              ...(authToken ? { "x-rzr-auth": authToken } : {}),
            },
            credentials: "same-origin",
          });
          const session = await readSessionPayload(response);

          if (!response.ok && response.status !== 410) {
            return;
          }

          if (session && session.snapshot) {
            renderSnapshot(session.snapshot);
          }
        } catch {
        }
      }

      function ensurePollingFallback() {
        if (useXtermRenderer) {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          return;
        }

        if (pollTimer) {
          clearInterval(pollTimer);
        }

        pollTimer = setInterval(() => {
          const streamLooksStale = !lastLiveEventAt || (Date.now() - lastLiveEventAt > 4000);
          if (streamLooksStale) {
            debugMetrics.pollFallbacks += 1;
            updateDebugMetrics();
            pollSession();
          }
        }, 1500);
      }

      function connectStream() {
        if (events) {
          events.close();
        }

        lastLiveEventAt = Date.now();
        const streamUrl = apiUrl("api/stream");
        streamUrl.searchParams.set("token", token);
        if (authToken) {
          streamUrl.searchParams.set("auth", authToken);
        }

        events = new EventSource(streamUrl);
        events.addEventListener("open", () => {
          lastLiveEventAt = Date.now();
          debugMetrics.streamOpens += 1;
          updateDebugMetrics();
          setConn("connected", true);
        });

        events.addEventListener("snapshot", (event) => {
          lastLiveEventAt = Date.now();
          renderSnapshot(JSON.parse(event.data));
        });

        events.addEventListener("heartbeat", () => {
          lastLiveEventAt = Date.now();
          if (!connectionState.ok) {
            setConn("connected", true);
          }
        });

        events.addEventListener("error", () => {
          debugMetrics.streamErrors += 1;
          updateDebugMetrics();
          setConn("reconnecting", false);
        });

        ensurePollingFallback();
      }

      function clearTerminalSocketReconnect() {
        if (terminalSocketReconnectTimer) {
          clearTimeout(terminalSocketReconnectTimer);
          terminalSocketReconnectTimer = null;
        }
      }

      function closeTerminalSocket() {
        clearTerminalSocketReconnect();
        if (terminalSocket) {
          terminalSocketManualClose = true;
          terminalSocket.close();
          terminalSocket = null;
        }
      }

      function scheduleTerminalSocketReconnect() {
        if (!useXtermRenderer || terminalSocketReconnectTimer || gate && !gate.hidden) {
          return;
        }

        terminalSocketReconnectTimer = setTimeout(() => {
          terminalSocketReconnectTimer = null;
          connectTerminalSocket();
        }, 1000);
      }

      function handleTerminalSocketMessage(payload) {
        lastLiveEventAt = Date.now();

        switch (payload?.type) {
          case "ready":
            transportObserverMode = Boolean(payload.observer);
            transportObserverMessage = transportObserverMode ? String(payload.reason || "") : "";
            setConn("connected", true);
            updateStatusSummary();
            break;
          case "snapshot":
            if (payload.snapshot) {
              renderSnapshot(payload.snapshot);
            }
            break;
          case "output":
            if (payload.data && terminal) {
              terminal.write(String(payload.data));
              lastRenderedScreen += String(payload.data);
              debugMetrics.appendPatches += 1;
              if (textEncoder) {
                debugMetrics.lastSnapshotBytes = textEncoder.encode(String(payload.data)).length;
              }
              if (pendingVisibleUpdateAt) {
                debugMetrics.lastVisibleLatencyMs = (window.performance?.now?.() ?? Date.now()) - pendingVisibleUpdateAt;
                pendingVisibleUpdateAt = 0;
              }
              updateDebugMetrics();
            }
            break;
          case "runtime-close":
            transportObserverMode = false;
            transportObserverMessage = "";
            setConn("reconnecting", false);
            scheduleTerminalSocketReconnect();
            break;
          case "error":
            subtitle.textContent = payload.error || "Terminal transport error";
            if (!(terminalSocket && terminalSocket.readyState === WebSocket.OPEN)) {
              setConn("reconnecting", false);
              scheduleTerminalSocketReconnect();
            }
            break;
          case "pong":
          case "runtime-event":
          default:
            break;
        }
      }

      function connectTerminalSocket() {
        closeTerminalSocket();
        lastLiveEventAt = Date.now();
        setConn("connecting", false);

        terminalSocket = new WebSocket(terminalWebSocketUrl());
        terminalSocket.addEventListener("open", () => {
          terminalSocketManualClose = false;
          debugMetrics.streamOpens += 1;
          updateDebugMetrics();
          const instance = ensureTerminal();
          terminalSocket.send(JSON.stringify({
            type: "connect",
            cols: instance ? instance.cols : 0,
            rows: instance ? instance.rows : 0,
            pauseAfter: 15,
          }));
        });
        terminalSocket.addEventListener("message", (event) => {
          try {
            handleTerminalSocketMessage(JSON.parse(String(event.data)));
          } catch {
            // ignore malformed payloads
          }
        });
        terminalSocket.addEventListener("close", () => {
          const wasManualClose = terminalSocketManualClose;
          terminalSocketManualClose = false;
          debugMetrics.streamErrors += 1;
          updateDebugMetrics();
          terminalSocket = null;
          if (!wasManualClose) {
            setConn("reconnecting", false);
            scheduleTerminalSocketReconnect();
          }
        });
        terminalSocket.addEventListener("error", () => {
          debugMetrics.streamErrors += 1;
          updateDebugMetrics();
        });

        ensurePollingFallback();
      }

      async function connectSession() {
        const response = await fetch(apiUrl("api/session"), {
          headers: {
            "x-rzr-token": token,
            ...(authToken ? { "x-rzr-auth": authToken } : {}),
          },
          credentials: "same-origin",
        });
        const session = await readSessionPayload(response);

        if (response.status === 401 && passwordRequired) {
          setGateVisible(true);
          return false;
        }

        if (!response.ok && response.status !== 410) {
          throw new Error(session && session.error ? session.error : response.statusText);
        }

        setGateVisible(false);
        if (session && session.snapshot && !useXtermRenderer) {
          renderSnapshot(session.snapshot);
        }
        attachTerminalResizeObserver();
        scheduleTerminalResize();
        if (useXtermRenderer && window.WebSocket) {
          connectTerminalSocket();
        } else {
          connectStream();
        }
        return true;
      }

      async function restartDeadSession() {
        if (readonly || restarting || processState.label !== "exited") {
          return;
        }

        restarting = true;
        updateStatusSummary();

        try {
          const response = await post("api/session/restart", {});
          const payload = await response.json();
          if (payload.snapshot) {
            renderSnapshot(payload.snapshot);
          }
        } catch (error) {
          subtitle.textContent = error.message || "Unable to restart the dead terminal.";
        } finally {
          restarting = false;
          updateStatusSummary();
        }
      }

      async function boot() {
        if (!token) {
          subtitle.textContent = "Missing token in URL";
          setConn("locked", false);
          setProc("unknown", false);
          return;
        }

        ensureTerminal();
        attachTerminalResizeObserver();
        window.addEventListener("resize", scheduleTerminalResize);
        window.visualViewport?.addEventListener("resize", scheduleTerminalResize);
        window.visualViewport?.addEventListener("scroll", scheduleTerminalResize);
        window.addEventListener("beforeunload", closeTerminalSocket);

        try {
          await connectSession();
        } catch (error) {
          subtitle.textContent = error.message;
          setConn("error", false);
        }
      }

      gateForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        try {
          const response = await post("api/login", { password: passwordField.value });
          const payload = await response.json();
          authToken = payload.authToken || "";
          passwordField.value = "";
          await connectSession();
        } catch (error) {
          setGateVisible(true, error.message);
        }
      });

      if (xtermSelectToggle) {
        xtermSelectToggle.addEventListener("click", () => {
          setTerminalSelectionMode(!terminalSelectionMode);
          if (!terminalSelectionMode) {
            terminal?.clearSelection();
          }
        });
      }

      if (xtermClearSelection) {
        xtermClearSelection.addEventListener("click", () => {
          clearTerminalSelection();
        });
      }

      if (xtermCopySelection) {
        xtermCopySelection.addEventListener("click", async () => {
          await copyTerminalSelection();
        });
      }

      const COMPOSER_COLLAPSED_KEY = "rzr:composer:collapsed";
      function setComposerCollapsed(collapsed) {
        if (!composerCard) return;
        composerCard.setAttribute("data-collapsed", collapsed ? "true" : "false");
        if (composerToggle) {
          composerToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
        }
        try {
          localStorage.setItem(COMPOSER_COLLAPSED_KEY, collapsed ? "1" : "0");
        } catch (_) {}
      }
      if (composerCard) {
        let initialCollapsed = false;
        try {
          initialCollapsed = localStorage.getItem(COMPOSER_COLLAPSED_KEY) === "1";
        } catch (_) {}
        setComposerCollapsed(initialCollapsed);
      }
      if (composerToggle) {
        composerToggle.addEventListener("click", () => {
          const next = composerCard.getAttribute("data-collapsed") !== "true";
          setComposerCollapsed(next);
          if (!next && composer && !composer.disabled) {
            composer.focus();
          }
        });
      }

      if (!readonly) {
        send.addEventListener("click", async () => {
          await pasteText(composer.value);
          clearComposer();
        });

        pasteOnly.addEventListener("click", async () => {
          await pasteText(composer.value);
          clearComposer();
        });

        const keys = {
          enter: "Enter",
          tab: "Tab",
          esc: "Escape",
          up: "Up",
          left: "Left",
          right: "Right",
          ctrlc: "C-c",
          ctrld: "C-d",
        };

        for (const [id, key] of Object.entries(keys)) {
          document.getElementById(id).addEventListener("click", async () => {
            await pressKey(key);
          });
        }
        if (restart) {
          restart.addEventListener("click", async () => {
            await restartDeadSession();
          });
        }

        composer.addEventListener("keydown", async (event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            await pasteAndEnter(composer.value);
            clearComposer();
          }
        });

        document.addEventListener("keydown", async (event) => {
          if (gate && !gate.hidden) {
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            await pressKey("Escape");
            return;
          }

          if (useXtermRenderer && event.key === "PageUp") {
            event.preventDefault();
            scrollTerminalPage(-1);
            return;
          }

          if (useXtermRenderer && event.key === "PageDown") {
            event.preventDefault();
            scrollTerminalPage(1);
            return;
          }

          if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "c") {
            event.preventDefault();
            await pressKey("C-c");
            return;
          }

          if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "d") {
            event.preventDefault();
            await pressKey("C-d");
          }
        });
      }

      updateDebugMetrics();
      boot();
    </script>
  </body>
</html>`;
}
