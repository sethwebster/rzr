function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderIndexHtml({ sessionName, readonly, passwordRequired }) {
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
    <script>
      (() => {
        const params = new URLSearchParams(window.location.search);
        const value = (params.get("chrome") || params.get("ui") || params.get("view") || "").toLowerCase();
        const noChrome = value === "0"
          || value === "false"
          || value === "off"
          || value === "minimal"
          || value === "screen"
          || value === "observe"
          || params.get("nochrome") === "1";

        if (noChrome) {
          document.documentElement.classList.add("no-chrome");
        }
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
        flex: 0 1 auto;
        display: grid;
        gap: 16px;
        padding: 22px 18px calc(18px + env(safe-area-inset-bottom));
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
        width: min(100%, 1040px);
        margin: 0 auto;
        display: grid;
        gap: 18px;
      }

      .composer-card {
        position: relative;
        display: grid;
        gap: 0;
        border: 1px solid rgba(136, 157, 198, 0.2);
        border-radius: 22px;
        overflow: hidden;
        background:
          linear-gradient(180deg, rgba(17, 22, 34, 0.98), rgba(11, 15, 24, 0.98));
        box-shadow:
          0 24px 64px rgba(0, 0, 0, 0.34),
          0 0 0 1px rgba(255, 255, 255, 0.03) inset,
          0 0 36px rgba(94, 134, 255, 0.08),
          0 0 120px rgba(48, 86, 192, 0.06);
      }

      .composer-card::before {
        content: "";
        position: absolute;
        inset: 0 0 auto;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.18), transparent);
        pointer-events: none;
      }

      .composer-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 26px 16px;
        border-bottom: 1px solid rgba(136, 157, 198, 0.14);
        background: linear-gradient(180deg, rgba(19, 25, 39, 0.92), rgba(15, 19, 30, 0.88));
      }

      .composer-topbar-left {
        display: inline-flex;
        align-items: center;
        gap: 16px;
        min-width: 0;
      }

      .composer-menu {
        color: rgba(173, 183, 204, 0.72);
        font-size: 24px;
        line-height: 1;
        letter-spacing: 0.02em;
      }

      .composer-title {
        font-size: 20px;
        font-weight: 700;
        color: rgba(237, 241, 250, 0.92);
      }

      .composer-state {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: rgba(211, 219, 236, 0.88);
        font-size: 15px;
        font-weight: 600;
        white-space: nowrap;
      }

      .composer-state-muted {
        color: rgba(155, 166, 187, 0.78);
        font-weight: 500;
      }

      .composer-state::before {
        content: "";
        width: 11px;
        height: 11px;
        border-radius: 999px;
        background: linear-gradient(180deg, #6cf59e, #2fbf71);
        box-shadow: 0 0 16px rgba(54, 214, 121, 0.7);
      }

      .composer-body {
        display: grid;
        gap: 18px;
        padding: 24px 28px 18px;
      }

      .composer-label-row {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .composer-label {
        font-size: 17px;
        font-weight: 700;
        color: rgba(232, 238, 246, 0.95);
      }

      .composer-rule {
        flex: 1 1 auto;
        height: 1px;
        background: linear-gradient(90deg, rgba(122, 143, 184, 0.25), rgba(122, 143, 184, 0.04));
      }

      .composer-shell {
        display: grid;
        gap: 14px;
      }

      .composer-field {
        position: relative;
        border: 1px solid rgba(108, 132, 182, 0.26);
        border-radius: 18px;
        overflow: hidden;
        background:
          linear-gradient(180deg, rgba(20, 26, 40, 0.96), rgba(14, 18, 29, 0.98));
        box-shadow:
          0 0 0 1px rgba(255, 255, 255, 0.03) inset,
          0 16px 40px rgba(0, 0, 0, 0.28),
          -12px 0 28px rgba(72, 136, 255, 0.06) inset;
      }

      .composer-field::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 2px;
        background: linear-gradient(180deg, rgba(79, 140, 255, 0.92), rgba(105, 184, 255, 0.6));
        box-shadow: 0 0 20px rgba(79, 140, 255, 0.45);
      }

      .composer-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        flex-wrap: wrap;
      }

      .composer-hint {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        color: rgba(169, 180, 202, 0.78);
        font-size: 13px;
      }

      .composer-actions {
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        flex: 0 0 auto;
      }

      .composer-hint::before {
        content: "";
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(180deg, #69dfa1, #2fbf71);
        box-shadow: 0 0 14px rgba(47, 191, 113, 0.45);
        flex: 0 0 auto;
      }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        padding: 2px;
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
        min-height: 244px;
        padding: 24px 26px;
        resize: vertical;
        border: 0;
        border-radius: 0;
        background: transparent;
        font: 17px/1.58 var(--mono);
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
        padding: 4px 2px 0;
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

        .controls {
          padding: 24px 24px calc(22px + env(safe-area-inset-bottom));
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
          padding: 14px 14px calc(14px + env(safe-area-inset-bottom));
          gap: 14px;
        }

        .controls-inner {
          gap: 14px;
        }

        .composer-card {
          border-radius: 18px;
        }

        .composer-topbar {
          padding: 16px 18px 14px;
          align-items: flex-start;
          flex-direction: column;
        }

        .composer-title {
          font-size: 18px;
        }

        .composer-state {
          font-size: 14px;
          white-space: normal;
        }

        .composer-body {
          gap: 14px;
          padding: 16px 16px 14px;
        }

        .composer-label {
          font-size: 15px;
        }

        textarea {
          min-height: 116px;
          max-height: 22dvh;
          padding: 16px 16px 16px 18px;
          font-size: 15px;
          line-height: 1.45;
        }

        .composer-footer {
          align-items: stretch;
          gap: 12px;
        }

        .composer-actions,
        .composer-actions button {
          width: 100%;
        }

        .composer-hint,
        .status-copy,
        .status-inline,
        .status-copy-quiet {
          font-size: 12px;
        }

        .toolbar {
          gap: 10px;
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
            <pre class="screen" id="screen"></pre>

            <section class="controls">
              <div class="controls-inner">
                <section class="composer-card">
                  <div class="composer-topbar">
                    <div class="composer-topbar-left">
                      <span class="composer-menu">☰</span>
                      <span class="composer-title">Composer</span>
                    </div>
                    <div class="composer-state" id="sessionState">Interactive · <span class="composer-state-muted">tmux session attached</span></div>
                  </div>

                  <div class="composer-body">
                    <div class="composer-label-row">
                      <span class="composer-label">Input</span>
                      <span class="composer-rule"></span>
                    </div>

                    <div class="composer-shell">
                      <div class="composer-field">
                        <textarea
                          id="composer"
                          placeholder="Type commands or paste text…"
                          ${readonly ? "disabled" : ""}
                        ></textarea>
                      </div>
                    </div>

                    <div class="composer-footer">
                      <div class="composer-hint">
                        <span class="status-copy" id="footerHint">${readonly ? "Viewing only." : "Cmd/Ctrl + Enter sends • Built for tmux-backed shells and REPLs."}</span>
                      </div>
                      <div class="composer-actions">
                        <button class="primary" id="send" ${readonly ? "disabled" : ""}>Send</button>
                      </div>
                    </div>
                  </div>
                </section>

                <div class="toolbar" aria-label="Terminal controls">
                  <div class="toolbar-group">
                    <button id="pasteOnly" ${readonly ? "disabled" : ""}>Paste</button>
                    <button id="tab" ${readonly ? "disabled" : ""}>Tab</button>
                    <button id="esc" ${readonly ? "disabled" : ""}>Esc</button>
                  </div>
                  <div class="toolbar-divider"></div>
                  <div class="toolbar-group">
                    <button class="icon" id="left" ${readonly ? "disabled" : ""}>←</button>
                    <button class="icon" id="up" ${readonly ? "disabled" : ""}>↑</button>
                    <button class="icon" id="right" ${readonly ? "disabled" : ""}>→</button>
                  </div>
                  <div class="toolbar-divider"></div>
                  <div class="toolbar-group">
                    <button class="danger" id="ctrlc" ${readonly ? "disabled" : ""}>Ctrl+C</button>
                    <button id="ctrld" ${readonly ? "disabled" : ""}>Ctrl+D</button>
                    <button id="enter" ${readonly ? "disabled" : ""}>Enter</button>
                  </div>
                </div>

                <div class="statusbar">
                  <div class="status-group">
                    <span class="status-inline" id="footerState">${readonly ? "Read-only" : "Interactive"}</span>
                    <span class="status-pill status-bad status-pill-hidden" id="conn">offline</span>
                    <span class="status-pill status-bad status-pill-hidden" id="proc">loading</span>
                    <span class="status-pill ${readonly ? "status-bad" : "status-ok"} status-pill-hidden">${readonly ? "read only" : "interactive"}</span>
                  </div>
                  <div class="status-group status-group-meta">
                    <span class="status-copy status-copy-quiet" id="footerMeta">${readonly ? "Viewing only." : "Interactive tmux session attached."}</span>
                  </div>
                </div>
              </div>
            </section>
          </section>
        </div>
      </section>
    </main>

    <script>
      const readonly = ${readonly ? "true" : "false"};
      const passwordRequired = ${passwordRequired ? "true" : "false"};
      const token = new URLSearchParams(window.location.search).get("token") || "";
      const screen = document.getElementById("screen");
      const subtitle = document.getElementById("subtitle");
      const conn = document.getElementById("conn");
      const proc = document.getElementById("proc");
      const sessionState = document.getElementById("sessionState");
      const footerState = document.getElementById("footerState");
      const footerMeta = document.getElementById("footerMeta");
      const composer = document.getElementById("composer");
      const send = document.getElementById("send");
      const pasteOnly = document.getElementById("pasteOnly");
      const gate = document.getElementById("gate");
      const gateForm = document.getElementById("gateForm");
      const passwordField = document.getElementById("password");
      const gateError = document.getElementById("gateError");
      let events = null;
      let pollTimer = null;
      let lastSnapshotRevision = -1;
      let lastLiveEventAt = 0;
      let authToken = "";
      let connectionState = { label: "offline", ok: false };
      let processState = { label: "loading", ok: false };
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

      function updateStatusSummary() {
        const connected = connectionState.ok;
        const live = processState.ok;
        let topText = "";
        let bottomText = "";

        if (readonly) {
          topText = live ? "Read-only · tmux session attached" : "Read-only · waiting for session";
          bottomText = connected ? "Read-only viewer connected." : "Read-only viewer reconnecting.";
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

        if (sessionState) {
          const parts = topText.split(" · ");
          if (parts.length > 1) {
            sessionState.innerHTML = escapeHtml(parts[0]) + ' · <span class="composer-state-muted">' + escapeHtml(parts.slice(1).join(" · ")) + "</span>";
          } else {
            sessionState.textContent = topText;
          }
        }

        if (footerState) {
          footerState.textContent = readonly ? "Read-only" : live ? "Interactive" : "Connecting";
        }

        if (footerMeta) {
          footerMeta.textContent = bottomText;
        }
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

      async function pasteText(value) {
        if (!value) {
          return;
        }

        const response = await post("api/input", { text: value });
        const payload = await response.json();
        if (payload.snapshot) {
          renderSnapshot(payload.snapshot);
        }
      }

      async function pressKey(key) {
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

      function renderAnsi(text) {
        const sgrPattern = /\\u001b\\[([0-9;]*)m/g;
        const oscPattern = /\\u001b\\][^\\u0007]*(\\u0007|\\u001b\\\\)/g;
        let cursor = 0;
        let style = defaultAnsiStyle();
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

        return html;
      }

      function renderSnapshot(snapshot) {
        if (typeof snapshot.revision === "number" && snapshot.revision <= lastSnapshotRevision) {
          return;
        }

        lastSnapshotRevision = typeof snapshot.revision === "number" ? snapshot.revision : lastSnapshotRevision;
        const beforeHeight = screen.scrollHeight;
        screen.innerHTML = renderAnsi(snapshot.screen || "");
        maybeStickToBottom(beforeHeight);

        const dead = Boolean(snapshot.info && snapshot.info.dead);
        const missing = Boolean(snapshot.info && snapshot.info.missing);
        const title = snapshot.info && snapshot.info.title ? " · " + snapshot.info.title : "";
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

          if (!response.ok) {
            return;
          }

          const session = await response.json();
          renderSnapshot(session.snapshot);
        } catch {
        }
      }

      function ensurePollingFallback() {
        if (pollTimer) {
          clearInterval(pollTimer);
        }

        pollTimer = setInterval(() => {
          const streamLooksStale = !lastLiveEventAt || (Date.now() - lastLiveEventAt > 4000);
          if (streamLooksStale) {
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
          setConn("reconnecting", false);
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

        if (response.status === 401 && passwordRequired) {
          setGateVisible(true);
          return false;
        }

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const session = await response.json();
        setGateVisible(false);
        renderSnapshot(session.snapshot);
        connectStream();
        return true;
      }

      async function boot() {
        if (!token) {
          subtitle.textContent = "Missing token in URL";
          setConn("locked", false);
          setProc("unknown", false);
          return;
        }

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

      boot();
    </script>
  </body>
</html>`;
}
