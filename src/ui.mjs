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
        --bg: #0d1117;
        --panel: #161b22;
        --panel-2: #1f2937;
        --border: #30363d;
        --text: #e6edf3;
        --muted: #8b949e;
        --accent: #2f81f7;
        --accent-2: #238636;
        --danger: #da3633;
        --mono: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
        --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        min-height: 100dvh;
        background:
          radial-gradient(circle at top, rgba(47, 129, 247, 0.18), transparent 30%),
          linear-gradient(180deg, #0d1117 0%, #090c10 100%);
        color: var(--text);
        font-family: var(--sans);
      }

      .app {
        width: 100%;
        min-height: 100vh;
        min-height: 100dvh;
      }

      .card {
        position: relative;
        display: flex;
        flex-direction: column;
        width: 100%;
        min-height: 100vh;
        min-height: 100dvh;
        background: rgba(22, 27, 34, 0.92);
        border: 0;
        border-radius: 0;
        box-shadow: none;
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
      }

      .title {
        display: grid;
        gap: 4px;
      }

      .title h1 {
        margin: 0;
        font-size: 16px;
        line-height: 1.2;
      }

      .title p {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
      }

      .badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .badge {
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.02);
        font-size: 12px;
        color: var(--muted);
      }

      .screen-wrap {
        flex: 1 1 auto;
        min-height: 0;
        padding: 0;
      }

      .screen {
        margin: 0;
        height: 100%;
        overflow: auto;
        padding: 16px calc(16px + env(safe-area-inset-right)) 16px calc(16px + env(safe-area-inset-left));
        font: 13px/1.35 var(--mono);
        white-space: pre-wrap;
        word-break: break-word;
        overscroll-behavior: contain;
      }

      .controls {
        display: grid;
        gap: 12px;
        padding:
          14px
          calc(12px + env(safe-area-inset-right))
          calc(16px + env(safe-area-inset-bottom))
          calc(12px + env(safe-area-inset-left));
        border-top: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.02);
      }

      .gate {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(9, 12, 16, 0.88);
        backdrop-filter: blur(8px);
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
        border-radius: 16px;
        border: 1px solid var(--border);
        background: rgba(22, 27, 34, 0.96);
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

      textarea,
      input {
        width: 100%;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--panel-2);
        color: var(--text);
      }

      textarea {
        min-height: 92px;
        resize: vertical;
        font: 14px/1.4 var(--mono);
      }

      input {
        font: 14px/1.2 var(--sans);
      }

      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      button {
        flex: 1 1 calc(33.333% - 8px);
        min-height: 42px;
        border: 1px solid var(--border);
        background: #21262d;
        color: var(--text);
        border-radius: 12px;
        padding: 10px 12px;
        font: 600 13px/1 var(--sans);
      }

      button.primary {
        background: var(--accent);
        border-color: rgba(47, 129, 247, 0.7);
      }

      button.success {
        background: var(--accent-2);
        border-color: rgba(35, 134, 54, 0.7);
      }

      button.danger {
        background: var(--danger);
        border-color: rgba(218, 54, 51, 0.7);
      }

      button:disabled,
      textarea:disabled,
      input:disabled {
        opacity: 0.55;
      }

      .hint {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.35;
      }

      .status-ok {
        color: #3fb950;
      }

      .status-bad {
        color: #ff7b72;
      }

      .error {
        min-height: 18px;
        color: #ff7b72;
        font-size: 12px;
      }

      @media (min-width: 720px) {
        .header {
          padding: 18px 24px 16px;
        }

        .screen {
          padding: 20px 24px;
          font-size: 14px;
        }

        .controls {
          padding: 16px 24px 24px;
        }

        button {
          flex: 0 1 auto;
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
            <h1>${title}</h1>
            <p id="subtitle">Connecting…</p>
          </div>
          <div class="badges">
            <span class="badge" id="conn">offline</span>
            <span class="badge" id="proc">loading</span>
          </div>
        </header>

        <div class="screen-wrap">
          <pre class="screen" id="screen"></pre>
        </div>

        <section class="controls">
          <textarea
            id="composer"
            placeholder="Type text to paste into the wrapped process"
            ${readonly ? "disabled" : ""}
          ></textarea>
          <div class="row">
            <button class="primary" id="send" ${readonly ? "disabled" : ""}>Paste</button>
            <button class="success" id="sendEnter" ${readonly ? "disabled" : ""}>Paste + Enter</button>
            <button id="enter" ${readonly ? "disabled" : ""}>Enter</button>
            <button id="tab" ${readonly ? "disabled" : ""}>Tab</button>
            <button class="danger" id="ctrlc" ${readonly ? "disabled" : ""}>Ctrl+C</button>
            <button id="ctrld" ${readonly ? "disabled" : ""}>Ctrl+D</button>
          </div>
          <div class="row">
            <button id="esc" ${readonly ? "disabled" : ""}>Esc</button>
            <button id="up" ${readonly ? "disabled" : ""}>Up</button>
            <button id="down" ${readonly ? "disabled" : ""}>Down</button>
            <button id="left" ${readonly ? "disabled" : ""}>Left</button>
            <button id="right" ${readonly ? "disabled" : ""}>Right</button>
          </div>
          <p class="hint">
            Works best for shells, REPLs, Claude, Codex, or any other terminal app launched through tmux.
            ${readonly ? "This session is read-only." : "Multiple phones can watch the same session."}
          </p>
        </section>
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
        conn.className = "badge " + (ok ? "status-ok" : "status-bad");
      }

      function setProc(label, ok) {
        proc.textContent = label;
        proc.className = "badge " + (ok ? "status-ok" : "status-bad");
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

        await post("/api/input", { text: value });
      }

      async function pressKey(key) {
        await post("/api/key", { key });
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

      function renderSnapshot(snapshot) {
        if (typeof snapshot.revision === "number" && snapshot.revision <= lastSnapshotRevision) {
          return;
        }

        lastSnapshotRevision = typeof snapshot.revision === "number" ? snapshot.revision : lastSnapshotRevision;
        const beforeHeight = screen.scrollHeight;
        screen.textContent = snapshot.screen || "";
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

      if (!readonly) {
        send.addEventListener("click", async () => {
          await pasteText(composer.value);
          composer.value = "";
        });

        sendEnter.addEventListener("click", async () => {
          await pasteAndEnter(composer.value);
          composer.value = "";
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
            await post("/api/key", { key });
          });
        }

        composer.addEventListener("keydown", async (event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            await pasteAndEnter(composer.value);
            composer.value = "";
          }
        });
      }

      boot();
    </script>
  </body>
</html>`;
}
