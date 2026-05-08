import {
  MINIGAME_IDS,
  MINIGAME_LABELS,
  type ClientIntent,
  type ControllerStateJson,
} from "@shared/messages";
import {
  KART_FORWARD_SPEED_MAX,
  KART_FORWARD_SPEED_MIN,
  resolveKartForwardSpeed,
} from "@shared/kartSettings";
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

function getOrCreateControllerClientId(): string {
  const key = "jb_controller_client_id";
  const existing = localStorage.getItem(key);
  if (existing && existing.trim()) return existing;
  const cid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cid_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  localStorage.setItem(key, cid);
  return cid;
}

function sendJson(ws: WebSocket, intent: ClientIntent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(intent));
  }
}

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room")?.trim();

const statusEl = document.querySelector<HTMLElement>("#status")!;
const panels = {
  prejoin: document.querySelector<HTMLElement>("#panel-prejoin")!,
  lobby: document.querySelector<HTMLElement>("#panel-lobby")!,
  menu: document.querySelector<HTMLElement>("#panel-menu")!,
  stub: document.querySelector<HTMLElement>("#panel-stub")!,
  raceWalk: document.querySelector<HTMLElement>("#panel-race-walk")!,
  frogger: document.querySelector<HTMLElement>("#panel-frogger")!,
  kart: document.querySelector<HTMLElement>("#panel-kart")!,
  kartPause: document.querySelector<HTMLElement>("#panel-kart-pause")!,
  results: document.querySelector<HTMLElement>("#panel-results")!,
  settings: document.querySelector<HTMLElement>("#panel-settings")!,
};

const fgDeathBanner = document.querySelector<HTMLElement>("#fg-death-banner")!;
const fgDeathSub = document.querySelector<HTMLElement>("#fg-death-sub")!;

const pjHint = document.querySelector<HTMLElement>("#pj-hint")!;
const pjResumeHint = document.querySelector<HTMLElement>("#pj-resume-hint")!;
const pjCreateHint = document.querySelector<HTMLElement>("#pj-create-hint")!;
const pjResume = document.querySelector<HTMLElement>("#pj-resume")!;
const pjResumeList = document.querySelector<HTMLElement>("#pj-resume-list")!;
const pjCreate = document.querySelector<HTMLElement>("#pj-create")!;
const pjName = document.querySelector<HTMLInputElement>("#pj-name")!;
const pjHue = document.querySelector<HTMLInputElement>("#pj-hue")!;
const pjHueVal = document.querySelector<HTMLElement>("#pj-hue-val")!;
const pjColorPreview = document.querySelector<HTMLElement>("#pj-color-preview")!;
const pjBackBtn = document.querySelector<HTMLButtonElement>("#pj-back")!;
const pjJoinBtn = document.querySelector<HTMLButtonElement>("#pj-join")!;

const menuListEl = document.querySelector<HTMLElement>("#menu-list")!;
const resultsHintEl = document.querySelector<HTMLElement>("#results-hint")!;
const resultsListEl = document.querySelector<HTMLElement>("#results-list")!;
const rwFireBtn = document.querySelector<HTMLButtonElement>("#rw-fire")!;
const rwStatusEl = document.querySelector<HTMLElement>("#rw-status")!;

const RESULT_LABELS = ["Play again", "Back to minigame select", "Add more controllers"];

const kartSpeedInput = document.querySelector<HTMLInputElement>("#set-kart-speed")!;
const kartSpeedVal = document.querySelector<HTMLElement>("#set-kart-speed-val")!;
kartSpeedInput.min = String(KART_FORWARD_SPEED_MIN);
kartSpeedInput.max = String(KART_FORWARD_SPEED_MAX);
kartSpeedInput.step = "5";

if (!roomId) {
  statusEl.textContent = "Missing ?room= in URL. Scan the QR on the host screen.";
} else {
  const controllerClientId = getOrCreateControllerClientId();
  let ctrlState: ControllerStateJson | null = null;
  let left = false;
  let right = false;
  let jump = false;
  let seq = 0;
  let forcedControllerPhase: ControllerStateJson["phase"] | null = null;
  let prejoinMode: "resume" | "create" = "resume";
  let prejoinTouched = { name: false, hue: false };

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

  let rwWalk = false;
  let rwRun = false;
  let rwPause = false;
  let rwAimUp = false;
  let rwAimDown = false;
  let rwFire = false;
  bindHold(
    document.querySelector("#rw-walk")!,
    () => {
      rwWalk = true;
    },
    () => {
      rwWalk = false;
    }
  );
  bindHold(
    document.querySelector("#rw-run")!,
    () => {
      rwRun = true;
    },
    () => {
      rwRun = false;
    }
  );
  bindHold(
    document.querySelector("#rw-aim-up")!,
    () => {
      rwAimUp = true;
    },
    () => {
      rwAimUp = false;
    }
  );
  bindHold(
    document.querySelector("#rw-aim-down")!,
    () => {
      rwAimDown = true;
    },
    () => {
      rwAimDown = false;
    }
  );
  document.querySelector("#rw-fire")!.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    rwFire = true;
    setTimeout(() => {
      rwFire = false;
    }, 100);
  });
  document.querySelector("#rw-pause")!.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    rwPause = true;
    setTimeout(() => {
      rwPause = false;
    }, 100);
  });

  let fgUp = false;
  let fgDown = false;
  let fgLeft = false;
  let fgRight = false;
  let fgPause = false;
  bindHold(
    document.querySelector("#fg-up")!,
    () => {
      fgUp = true;
    },
    () => {
      fgUp = false;
    }
  );
  bindHold(
    document.querySelector("#fg-down")!,
    () => {
      fgDown = true;
    },
    () => {
      fgDown = false;
    }
  );
  bindHold(
    document.querySelector("#fg-left")!,
    () => {
      fgLeft = true;
    },
    () => {
      fgLeft = false;
    }
  );
  bindHold(
    document.querySelector("#fg-right")!,
    () => {
      fgRight = true;
    },
    () => {
      fgRight = false;
    }
  );
  document.querySelector("#fg-pause")!.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    fgPause = true;
    setTimeout(() => {
      fgPause = false;
    }, 100);
  });

  const ws = new WebSocket(`${wsUrl()}?cid=${encodeURIComponent(controllerClientId)}`);
  ws.binaryType = "arraybuffer";

  function syncKartSettingsFromState(st: ControllerStateJson): void {
    const v = resolveKartForwardSpeed(st.gameSettings);
    kartSpeedInput.value = String(v);
    kartSpeedVal.textContent = String(v);
  }

  function hideAll(): void {
    Object.values(panels).forEach((p) => {
      if (p) p.hidden = true;
    });
  }

  const fallbackMenuItems = MINIGAME_IDS.map((id) => ({ id, label: MINIGAME_LABELS[id] }));

  function renderMinigameMenu(st: ControllerStateJson | null): void {
    const items =
      st && Array.isArray(st.menuItems) && st.menuItems.length > 0 ? st.menuItems : fallbackMenuItems;
    const n = items.length;
    const idxRaw = st?.menuIndex ?? 0;
    const idx = n <= 0 ? 0 : ((idxRaw % n) + n) % n;
    menuListEl.textContent = "";
    items.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = `menu-list-row${i === idx ? " selected" : ""}`;
      row.textContent = `${i === idx ? "› " : "  "}${item.label}`;
      menuListEl.appendChild(row);
    });
  }

  function resultsFinishedTitle(phase: ControllerStateJson["phase"]): string {
    switch (phase) {
      case "kart_results":
        return "Race finished";
      case "race_walk_results":
        return "Race Walk finished";
      case "frogger_results":
        return "Frogger finished";
      default:
        return "Game finished";
    }
  }

  function renderResultsMenu(st: ControllerStateJson): void {
    resultsHintEl.textContent = resultsFinishedTitle(st.phase);
    const n = RESULT_LABELS.length;
    const idx = ((st.menuIndex % n) + n) % n;
    resultsListEl.textContent = "";
    RESULT_LABELS.forEach((label, i) => {
      const row = document.createElement("div");
      row.className = `menu-list-row${i === idx ? " selected" : ""}`;
      row.textContent = `${i === idx ? "› " : "  "}${label}`;
      resultsListEl.appendChild(row);
    });
  }

  function setHueUi(hue: number): void {
    const h = ((Math.round(hue) % 360) + 360) % 360;
    pjHue.value = String(h);
    pjHueVal.textContent = `hue ${h}`;
    pjColorPreview.style.background = `linear-gradient(180deg, hsl(${h} 75% 58%), hsl(${h} 75% 42%))`;
    pjHue.style.accentColor = `hsl(${h} 75% 58%)`;
  }

  function renderPrejoin(st: ControllerStateJson): void {
    const pj = st.prejoin;
    if (!pj) return;
    if (!prejoinTouched.name) pjName.value = pj.suggestedName;
    if (!prejoinTouched.hue) setHueUi(pj.suggestedHue);

    const resumables = pj.resumablePlayers ?? [];
    const hasResumables = resumables.length > 0;

    pjHint.textContent = hasResumables ? "Join game" : "";
    pjResumeHint.textContent = hasResumables ? "Resume a disconnected player, or create a new one." : "";
    pjCreateHint.textContent = "Create new player";

    pjResumeList.textContent = "";
    if (hasResumables) {
      const createBtn = document.createElement("button");
      createBtn.type = "button";
      createBtn.className = "primary";
      createBtn.textContent = "Create new player";
      createBtn.addEventListener("click", () => {
        prejoinMode = "create";
        refreshUI();
      });
      pjResumeList.appendChild(createBtn);

      for (const p of resumables) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "secondary";
        b.textContent =
          p.secondsLeft !== undefined ? `Join as ${p.name} (${p.secondsLeft}s)` : `Join as ${p.name}`;
        b.addEventListener("click", () => {
          sendJson(ws, { type: "prejoin_claim", playerId: p.playerId });
        });
        pjResumeList.appendChild(b);
      }
      pjResume.hidden = false;
      pjCreate.hidden = true;
    } else {
      prejoinMode = "create";
      pjResume.hidden = true;
      pjCreate.hidden = false;
    }

    if (prejoinMode === "create") {
      pjResume.hidden = true;
      pjCreate.hidden = false;
    }
  }

  function syncFroggerPanelState(st: ControllerStateJson | null): void {
    const fg = st?.frogger;
    const tick = st?.tick ?? 0;
    if (!fg) {
      fgDeathBanner.hidden = true;
      fgDeathSub.textContent = "";
      return;
    }
    const noticeOk = fg.deathNotice && tick < fg.deathNotice.untilTick;
    const showDead =
      !fg.alive &&
      (noticeOk ||
        st?.phase === "frogger" ||
        st?.phase === "frogger_paused" ||
        st?.phase === "frogger_results");
    if (showDead) {
      fgDeathBanner.hidden = false;
      fgDeathSub.textContent = noticeOk
        ? fg.deathNotice!.text.replace(/^You died\s*[—-]\s*/i, "").trim() || `You got ${fg.distance} m`
        : `You got ${fg.distance} m`;
    } else {
      fgDeathBanner.hidden = true;
      fgDeathSub.textContent = "";
    }
  }

  function syncRaceWalkPanelState(st: ControllerStateJson | null): void {
    const rw = st?.raceWalk;
    if (!rw) {
      rwFireBtn.disabled = false;
      rwFireBtn.textContent = "Fire";
      rwStatusEl.hidden = true;
      rwStatusEl.textContent = "";
      return;
    }
    const outOfAmmo = rw.ammo <= 0;
    const dead = rw.runnerDowned;
    rwFireBtn.disabled = outOfAmmo || dead;
    rwFireBtn.textContent = outOfAmmo ? "No bullets remaining" : "Fire";
    if (dead) {
      rwStatusEl.hidden = false;
      rwStatusEl.textContent = "You died.";
    } else {
      rwStatusEl.hidden = true;
      rwStatusEl.textContent = "";
    }
  }

  function refreshUI(): void {
    const st = ctrlState;
    syncRaceWalkPanelState(st);
    syncFroggerPanelState(st);
    hideAll();
    if (!st) {
      statusEl.textContent = "Connecting…";
      return;
    }
    statusEl.textContent = "";
    if (st.playerId === 0 && st.prejoin) {
      panels.prejoin.hidden = false;
      renderPrejoin(st);
      return;
    }
    if (st.settingsOpen) {
      syncKartSettingsFromState(st);
      panels.settings.hidden = false;
      return;
    }
    const ph = forcedControllerPhase ?? st.phase;
    if (ph === "lobby") {
      panels.lobby.hidden = false;
    } else if (ph === "menu") {
      panels.menu.hidden = false;
      renderMinigameMenu(st);
    } else if (ph === "stub") {
      panels.stub.hidden = false;
    } else if (ph === "race_walk") {
      panels.raceWalk.hidden = false;
    } else if (ph === "frogger") {
      panels.frogger.hidden = false;
    } else if (ph === "kart") {
      panels.kart.hidden = false;
    } else if (ph === "kart_paused" || ph === "race_walk_paused" || ph === "frogger_paused") {
      panels.kartPause.hidden = false;
    } else if (ph === "kart_results" || ph === "race_walk_results" || ph === "frogger_results") {
      panels.results.hidden = false;
      renderResultsMenu(st);
    }
  }

  function showMenuPanelImmediately(): void {
    hideAll();
    panels.menu.hidden = false;
    renderMinigameMenu(ctrlState);
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

  pjName.addEventListener("input", () => {
    prejoinTouched.name = true;
    pjName.value = pjName.value.toUpperCase().slice(0, 4);
  });
  pjHue.addEventListener("input", () => {
    prejoinTouched.hue = true;
    setHueUi(Number(pjHue.value));
  });
  pjBackBtn.addEventListener("click", () => {
    prejoinMode = "resume";
    refreshUI();
  });
  pjJoinBtn.addEventListener("click", () => {
    const name = pjName.value.toUpperCase().slice(0, 4);
    const hue = Number(pjHue.value);
    sendJson(ws, { type: "prejoin_create", name, hue });
  });

  /**
   * Menu arrow / confirm pads: fire once on press only (pointerdown).
   * Do not also listen to click — it fires after release and doubles navigation on touch/mouse.
   * Keyboard: Space/Enter on focused button (window Enter skips focused buttons for confirm).
   */
  function bindPointerTap(el: HTMLElement, fn: () => void): void {
    el.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button !== 0 && e.button !== -1) return;
        e.preventDefault();
        fn();
      },
      { passive: false }
    );
    el.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        fn();
      }
    });
  }

  bindPointerTap(document.querySelector("#mn-up")!, () => {
    sendJson(ws, { type: "menu_nav", dir: "up" });
  });
  bindPointerTap(document.querySelector("#mn-down")!, () => {
    sendJson(ws, { type: "menu_nav", dir: "down" });
  });
  bindPointerTap(document.querySelector("#mn-confirm")!, () => {
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

  bindPointerTap(document.querySelector("#rs-up")!, () => {
    sendJson(ws, { type: "menu_nav", dir: "up" });
  });
  bindPointerTap(document.querySelector("#rs-down")!, () => {
    sendJson(ws, { type: "menu_nav", dir: "down" });
  });
  bindPointerTap(document.querySelector("#rs-confirm")!, () => {
    sendJson(ws, { type: "menu_confirm" });
  });

  /** Minigame menu + post-game results: physical ↑↓/Enter (no listeners existed before). */
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!ctrlState || ws.readyState !== WebSocket.OPEN) return;
    if (ctrlState.settingsOpen) return;
    const ph = forcedControllerPhase ?? ctrlState.phase;
    const menuLike =
      ph === "menu" ||
      ph === "kart_results" ||
      ph === "race_walk_results" ||
      ph === "frogger_results";
    if (!menuLike) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest("input, textarea, select")) return;
    if (e.repeat) return;

    if (e.code === "ArrowUp") {
      e.preventDefault();
      sendJson(ws, { type: "menu_nav", dir: "up" });
      return;
    }
    if (e.code === "ArrowDown") {
      e.preventDefault();
      sendJson(ws, { type: "menu_nav", dir: "down" });
      return;
    }
    if (e.code === "Enter") {
      if (el?.closest("button, a[href]")) return;
      e.preventDefault();
      sendJson(ws, { type: "menu_confirm" });
    }
  });

  document.querySelector("#set-close")!.addEventListener("click", () => {
    sendJson(ws, { type: "settings_close" });
  });

  kartSpeedInput.addEventListener("input", () => {
    const n = Number(kartSpeedInput.value);
    kartSpeedVal.textContent = String(n);
    sendJson(ws, { type: "game_settings_patch", patch: { kartForwardSpeed: n } });
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
      } else if (ph === "race_walk") {
        let buttons = 0;
        if (rwWalk) buttons |= Btn.Jump;
        if (rwRun) buttons |= Btn.Run;
        if (rwPause) buttons |= Btn.Pause;
        if (rwAimUp) buttons |= Btn.AimUp;
        if (rwAimDown) buttons |= Btn.AimDown;
        if (rwFire) buttons |= Btn.Fire;
        ws.send(encodeInput(seq, 0, buttons));
      } else if (ph === "frogger") {
        let h = 0;
        if (fgLeft && !fgRight) h = -127;
        else if (fgRight && !fgLeft) h = 127;
        let buttons = 0;
        if (fgUp) buttons |= Btn.AimUp;
        if (fgDown) buttons |= Btn.AimDown;
        if (fgPause) buttons |= Btn.Pause;
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
