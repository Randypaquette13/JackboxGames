import type { ClientIntent, ControllerStateJson } from "@shared/messages";
import {
  Btn,
  encodeInput,
  encodeJoin,
  encodePing,
  Op,
  parseError,
  parseWelcome,
} from "@shared/protocol";

function wsUrl(): string {
  const p = location.protocol === "https:" ? "wss:" : "ws:";
  return `${p}//${location.host}/ws`;
}

function sendJson(ws: WebSocket, intent: ClientIntent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(intent));
  }
}

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room")?.trim();

const statusEl = document.querySelector<HTMLElement>("#status")!;
const debugPhaseEl = document.querySelector<HTMLElement>("#debug-phase");
const panels = {
  lobby: document.querySelector<HTMLElement>("#panel-lobby")!,
  menu: document.querySelector<HTMLElement>("#panel-menu")!,
  stub: document.querySelector<HTMLElement>("#panel-stub")!,
  kart: document.querySelector<HTMLElement>("#panel-kart")!,
  kartPause: document.querySelector<HTMLElement>("#panel-kart-pause")!,
  results: document.querySelector<HTMLElement>("#panel-results")!,
  settings: document.querySelector<HTMLElement>("#panel-settings")!,
};

const menuPreview = document.querySelector<HTMLElement>("#menu-preview")!;
const resultsPreview = document.querySelector<HTMLElement>("#results-preview")!;

const RESULT_LABELS = ["Play again", "Back to minigame select", "Add more controllers"];

if (!roomId) {
  statusEl.textContent = "Missing ?room= in URL. Scan the QR on the host screen.";
} else {
  let ctrlState: ControllerStateJson | null = null;
  let left = false;
  let right = false;
  let jump = false;
  let seq = 0;
  let forcedControllerPhase: ControllerStateJson["phase"] | null = null;

  function bindHold(el: HTMLElement, onDown: () => void, onUp: () => void): void {
    el.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onDown();
      },
      { passive: false }
    );
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("lostpointercapture", onUp);
  }

  bindHold(
    document.querySelector("#lb-left")!,
    () => {
      left = true;
    },
    () => {
      left = false;
    }
  );
  bindHold(
    document.querySelector("#lb-right")!,
    () => {
      right = true;
    },
    () => {
      right = false;
    }
  );
  bindHold(
    document.querySelector("#lb-jump")!,
    () => {
      jump = true;
    },
    () => {
      jump = false;
    }
  );

  let kLeft = false;
  let kRight = false;
  let kPause = false;
  bindHold(
    document.querySelector("#kt-left")!,
    () => {
      kLeft = true;
    },
    () => {
      kLeft = false;
    }
  );
  bindHold(
    document.querySelector("#kt-right")!,
    () => {
      kRight = true;
    },
    () => {
      kRight = false;
    }
  );
  document.querySelector("#kt-pause")!.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    kPause = true;
    setTimeout(() => {
      kPause = false;
    }, 100);
  });

  const ws = new WebSocket(wsUrl());
  ws.binaryType = "arraybuffer";

  function hideAll(): void {
    Object.values(panels).forEach((p) => {
      if (p) p.hidden = true;
    });
  }

  function refreshUI(): void {
    const st = ctrlState;
    hideAll();
    if (debugPhaseEl) {
      debugPhaseEl.hidden = false;
      const serverPhase = st?.phase ?? "none";
      const forced = forcedControllerPhase ?? "none";
      const shown = forcedControllerPhase ?? serverPhase;
      debugPhaseEl.textContent = `server: ${serverPhase}\nforced: ${forced}\nshown:  ${shown}`;
    }
    if (!st) {
      statusEl.textContent = "Connecting…";
      return;
    }
    statusEl.textContent = "";
    if (st.settingsOpen) {
      panels.settings.hidden = false;
      return;
    }
    const ph = forcedControllerPhase ?? st.phase;
    if (ph === "lobby") {
      panels.lobby.hidden = false;
    } else if (ph === "menu") {
      panels.menu.hidden = false;
      const cur = st.menuItems[st.menuIndex];
      menuPreview.textContent = cur ? cur.label : "";
    } else if (ph === "stub") {
      panels.stub.hidden = false;
    } else if (ph === "kart") {
      panels.kart.hidden = false;
    } else if (ph === "kart_paused") {
      panels.kartPause.hidden = false;
    } else if (ph === "kart_results") {
      panels.results.hidden = false;
      resultsPreview.textContent = RESULT_LABELS[st.menuIndex % 3] ?? "";
    }
  }

  function showMenuPanelImmediately(): void {
    hideAll();
    panels.menu.hidden = false;
    if (ctrlState) {
      const cur = ctrlState.menuItems[ctrlState.menuIndex];
      menuPreview.textContent = cur ? cur.label : "Minigame menu";
    } else {
      menuPreview.textContent = "Minigame menu";
    }
    statusEl.textContent = "";
  }

  ws.addEventListener("open", () => {
    statusEl.textContent = "Connected";
    ws.send(encodeJoin("controller", roomId));
  });

  ws.addEventListener("message", (ev) => {
    if (typeof ev.data === "string") {
      try {
        ctrlState = JSON.parse(ev.data) as ControllerStateJson;
        if (ctrlState.type === "controller_state") {
          if (forcedControllerPhase && ctrlState.phase !== "lobby") {
            forcedControllerPhase = null;
          }
          refreshUI();
        }
      } catch {
        /* ignore */
      }
      return;
    }
    const data = ev.data as ArrayBuffer;
    const op = new DataView(data).getUint8(0);
    if (op === Op.ServerWelcome) {
      parseWelcome(data);
      refreshUI();
      return;
    }
    if (op === Op.ServerError) {
      statusEl.textContent = parseError(data);
    }
  });

  ws.addEventListener("close", () => {
    statusEl.textContent = "Disconnected";
    hideAll();
  });

  const lobbyReadyBtn = document.querySelector<HTMLElement>("#lb-ready")!;
  let readyPressed = false;
  const sendAllReady = () => {
    if (readyPressed) return;
    readyPressed = true;
    forcedControllerPhase = "menu";
    if (ctrlState && ctrlState.phase === "lobby") {
      ctrlState = { ...ctrlState, phase: "menu" };
    }
    sendJson(ws, { type: "all_ready" });
    showMenuPanelImmediately();
    setTimeout(() => {
      readyPressed = false;
    }, 250);
  };
  lobbyReadyBtn.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      sendAllReady();
    },
    { passive: false }
  );
  lobbyReadyBtn.addEventListener("click", () => {
    sendAllReady();
  });

  document.querySelector("#mn-up")!.addEventListener("click", () => {
    sendJson(ws, { type: "menu_nav", dir: "up" });
  });
  document.querySelector("#mn-down")!.addEventListener("click", () => {
    sendJson(ws, { type: "menu_nav", dir: "down" });
  });
  document.querySelector("#mn-confirm")!.addEventListener("click", () => {
    sendJson(ws, { type: "menu_confirm" });
  });
  document.querySelector("#mn-add")!.addEventListener("click", () => {
    sendJson(ws, { type: "menu_add_players" });
  });
  document.querySelector("#mn-settings")!.addEventListener("click", () => {
    sendJson(ws, { type: "menu_game_settings" });
  });

  document.querySelector("#st-back")!.addEventListener("click", () => {
    sendJson(ws, { type: "stub_back" });
  });

  document.querySelector("#kp-resume")!.addEventListener("click", () => {
    sendJson(ws, { type: "pause_resume" });
  });
  document.querySelector("#kp-menu")!.addEventListener("click", () => {
    sendJson(ws, { type: "pause_to_menu" });
  });

  document.querySelector("#rs-up")!.addEventListener("click", () => {
    sendJson(ws, { type: "menu_nav", dir: "up" });
  });
  document.querySelector("#rs-down")!.addEventListener("click", () => {
    sendJson(ws, { type: "menu_nav", dir: "down" });
  });
  document.querySelector("#rs-confirm")!.addEventListener("click", () => {
    sendJson(ws, { type: "menu_confirm" });
  });

  document.querySelector("#set-close")!.addEventListener("click", () => {
    sendJson(ws, { type: "settings_close" });
  });

  function loop(): void {
    if (ws.readyState === WebSocket.OPEN && ctrlState) {
      seq = (seq + 1) >>> 0;
      const ph = ctrlState.phase;
      if (ph === "lobby") {
        let h = 0;
        if (left && !right) h = -127;
        else if (right && !left) h = 127;
        const buttons = jump ? Btn.Jump : 0;
        ws.send(encodeInput(seq, h, buttons));
      } else if (ph === "kart") {
        let h = 0;
        if (kLeft && !kRight) h = -127;
        else if (kRight && !kLeft) h = 127;
        const buttons = kPause ? Btn.Pause : 0;
        ws.send(encodeInput(seq, h, buttons));
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(encodePing(performance.now()));
    }
  }, 2000);
}
