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
        flex: 0 0 auto;
        display: grid;
        gap: 12px;
        padding: 12px;
        border-top: 1px solid var(--border);
        background:
          linear-gradient(180deg, rgba(7, 11, 17, 0.08), rgba(7, 11, 17, 0.92) 24%),
          rgba(7, 11, 17, 0.94);
        backdrop-filter: blur(18px);
        box-shadow: 0 -16px 40px rgba(0, 0, 0, 0.28);
      }

      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .toolbar-group {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        min-width: 0;
      }

      .toolbar-group-main {
        margin-right: 4px;
      }

      .toolbar button {
        min-height: 38px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid var(--border-strong);
        background: rgba(255, 255, 255, 0.05);
        color: var(--text);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.01em;
        transition:
          transform 120ms ease,
          border-color 120ms ease,
          background 120ms ease,
          box-shadow 120ms ease;
      }

      .toolbar button.primary {
        background: linear-gradient(180deg, #5f99ff 0%, var(--accent-strong) 100%);
        border-color: rgba(95, 153, 255, 0.78);
        box-shadow: 0 10px 24px rgba(47, 129, 247, 0.25);
      }

      .toolbar button.success {
        background: linear-gradient(180deg, #31cc7a 0%, #218a51 100%);
        border-color: rgba(49, 204, 122, 0.65);
        box-shadow: 0 10px 24px rgba(47, 191, 113, 0.2);
      }

      .toolbar button.danger {
        background: rgba(255, 107, 107, 0.12);
        border-color: rgba(255, 107, 107, 0.3);
        color: #ffc3c3;
      }

      .composer-shell {
        display: grid;
        gap: 10px;
        margin: 0 -12px;
        padding: 10px 12px 0;
        border-top: 1px solid var(--border);
        background: linear-gradient(180deg, rgba(20, 28, 42, 0.58), rgba(10, 15, 24, 0.9));
      }

      .composer-meta {
        color: var(--muted);
        font-size: 12px;
      }

      .composer-meta {
        max-width: 100%;
        text-align: right;
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
        min-height: 108px;
        padding: 14px 16px;
        resize: vertical;
        border-left: 0;
        border-right: 0;
        border-radius: 0;
        font: 14px/1.45 var(--mono);
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
        gap: 10px 14px;
        min-width: 0;
        padding: 2px 2px 0;
      }

      .status-group {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
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
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.04);
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
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
        font-size: 12px;
        max-width: 100%;
        overflow-wrap: anywhere;
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
          border-color: rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.08);
        }

        .toolbar button.primary:hover:not(:disabled) {
          background: linear-gradient(180deg, #73a6ff 0%, #3c86ef 100%);
        }

        .toolbar button.success:hover:not(:disabled) {
          background: linear-gradient(180deg, #3cd888 0%, #23955a 100%);
        }

        .toolbar button.danger:hover:not(:disabled) {
          background: rgba(255, 107, 107, 0.18);
          border-color: rgba(255, 107, 107, 0.42);
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
          padding: 14px 14px 12px;
        }

        .composer-shell {
          margin: 0 -14px;
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
              <div class="toolbar" aria-label="Terminal controls">
                <div class="toolbar-group toolbar-group-main">
                  <button class="primary" id="send" ${readonly ? "disabled" : ""}>Paste</button>
                  <button class="success" id="sendEnter" ${readonly ? "disabled" : ""}>Paste + Enter</button>
                </div>
                <div class="toolbar-group">
                  <button id="enter" ${readonly ? "disabled" : ""}>Enter</button>
                  <button id="tab" ${readonly ? "disabled" : ""}>Tab</button>
                  <button class="danger" id="ctrlc" ${readonly ? "disabled" : ""}>Ctrl+C</button>
                  <button id="ctrld" ${readonly ? "disabled" : ""}>Ctrl+D</button>
                </div>
                <div class="toolbar-group">
                  <button id="esc" ${readonly ? "disabled" : ""}>Esc</button>
                  <button id="up" ${readonly ? "disabled" : ""}>↑</button>
                  <button id="down" ${readonly ? "disabled" : ""}>↓</button>
                  <button id="left" ${readonly ? "disabled" : ""}>←</button>
                  <button id="right" ${readonly ? "disabled" : ""}>→</button>
                </div>
              </div>

              <div class="composer-shell">
                <textarea
                  id="composer"
                  placeholder="Type text to paste into the wrapped process"
                  ${readonly ? "disabled" : ""}
                ></textarea>
              </div>

              <div class="statusbar">
                <div class="status-group">
                  <span class="status-pill status-bad" id="conn">offline</span>
                  <span class="status-pill status-bad" id="proc">loading</span>
                  <span class="status-pill ${readonly ? "status-bad" : "status-ok"}">${readonly ? "read only" : "interactive"}</span>
                </div>
                <div class="status-group status-group-meta">
                  <span class="status-copy">${readonly ? "Viewing only." : "⌘/Ctrl + Enter sends and hits Enter."}</span>
                  <span class="status-copy">Built for tmux-backed shells and REPLs.</span>
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
      const composer = document.getElementById("composer");
      const composerMeta = document.getElementById("composerMeta");
      const send = document.getElementById("send");
      const sendEnter = document.getElementById("sendEnter");
      const gate = document.getElementById("gate");
      const gateForm = document.getElementById("gateForm");
      const passwordField = document.getElementById("password");
      const gateError = document.getElementById("gateError");
      let events = null;
      let pollTimer = null;
      let lastSnapshotRevision = -1;
      let lastLiveEventAt = 0;
      let authToken = "";

      function setConn(label, ok) {
        conn.textContent = label;
        conn.className = "status-pill " + (ok ? "status-ok" : "status-bad");
      }

      function setProc(label, ok) {
        proc.textContent = label;
        proc.className = "status-pill " + (ok ? "status-ok" : "status-bad");
      }

      function updateComposerMeta() {
        if (!composerMeta || !composer) {
          return;
        }

        const length = composer.value.length;
        if (readonly) {
          composerMeta.textContent = "Read-only session";
          return;
        }

        composerMeta.textContent = length
          ? String(length) + " char" + (length === 1 ? "" : "s") + " ready"
          : "Buffer empty";
      }

      function clearComposer() {
        composer.value = "";
        updateComposerMeta();
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
        const response = await fetch(path, {
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

        const response = await post("/api/input", { text: value });
        const payload = await response.json();
        if (payload.snapshot) {
          renderSnapshot(payload.snapshot);
        }
      }

      async function pressKey(key) {
        const response = await post("/api/key", { key });
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
        const esc = String.fromCharCode(27);
        const sgrPattern = new RegExp(esc + "\\\\[([0-9;]*)m", "g");
        const oscPattern = new RegExp(esc + "\\\\][^\\u0007]*(\\u0007|" + esc + "\\\\\\\\)", "g");
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
          const response = await fetch("/api/session", {
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
        const streamUrl = new URL("/api/stream", window.location.origin);
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

        events.addEventListener("error", () => {
          setConn("reconnecting", false);
        });

        ensurePollingFallback();
      }

      async function connectSession() {
        const response = await fetch("/api/session", {
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
          const response = await post("/api/login", { password: passwordField.value });
          const payload = await response.json();
          authToken = payload.authToken || "";
          passwordField.value = "";
          await connectSession();
        } catch (error) {
          setGateVisible(true, error.message);
        }
      });

      composer.addEventListener("input", updateComposerMeta);

      if (!readonly) {
        send.addEventListener("click", async () => {
          await pasteText(composer.value);
          clearComposer();
        });

        sendEnter.addEventListener("click", async () => {
          await pasteAndEnter(composer.value);
          clearComposer();
        });

        const keys = {
          enter: "Enter",
          tab: "Tab",
          esc: "Escape",
          up: "Up",
          down: "Down",
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

      updateComposerMeta();
      boot();
    </script>
  </body>
</html>`;
}
