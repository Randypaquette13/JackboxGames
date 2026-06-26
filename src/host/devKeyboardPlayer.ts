/**
 * Dev controllers: multiple WS connections; keyboard mirrors phone (binary + JSON).
 * Lobby: A/D or arrows move, Space/W jump, R or “All players joined” = all ready.
 * Menu / results: arrows navigate, Enter = confirm, F2/F3 = Back to lobby / Game settings (panel buttons too).
 * Settings overlay: Esc or F4 close, −/+ adjust kart speed (slider on panel).
 * Stub: Esc or panel “Back to menu”.
 * Kart: A/D steer, B = boost, P or Esc = pause edge.
 * Race Walk: J/L walk-run, I/K aim, F fire.
 * Frogger: WASD or arrows move, P/Esc pause.
 * Bomberman: WASD or arrows move, Space bomb, P/Esc pause.
 * Football team select: 1 Red / 2 Blue, Enter START. Play: WASD or arrows move, E pass while carrying, P/Esc pause edge.
 * Air Hockey team select: 1 Red / 2 Blue, Enter START. Play: WASD or arrows move, P/Esc pause edge.
 */
import type { ClientIntent, GamePhase } from "@shared/messages";
import {
  clampKartForwardSpeed,
  KART_FORWARD_SPEED_MAX,
  KART_FORWARD_SPEED_MIN,
  resolveKartForwardSpeed,
} from "@shared/kartSettings";
import { joystickToPackedFootballAxis } from "@shared/footballPackedInput";
import { Btn, encodeFootballAxis, encodeInput, encodeJoin, Op, parseWelcome } from "@shared/protocol";

type Slot = {
  ws: WebSocket;
  seq: number;
  playerId: number | null;
  didPrejoin: boolean;
};

export type DevHostSnapshot = {
  settingsOpen: boolean;
  gameSettings: Record<string, unknown>;
};

export type DevKeyboardHost = {
  getPhase: () => GamePhase;
  getHostSnapshot: () => DevHostSnapshot;
};

function devHintForScreen(ph: GamePhase, snap: DevHostSnapshot): string {
  if (snap.settingsOpen) {
    return "Esc or F4: close · −/+: kart speed · slider below · Tab: target player";
  }
  switch (ph) {
    case "lobby":
      return "A/D or ←/→: move · Space/W/↑: jump · Enter/R or All ready · Tab: target player";
    case "menu":
      return "↑↓: navigate · Enter: confirm · H: How to play · Esc: close help · F2: lobby · F3: settings · Tab: target";
    case "stub":
      return "Esc or Back to menu · Tab: target player";
    case "kart":
      return "A/D or ←/→: steer · B: boost · P or Esc: pause · Tab: target player";
    case "kart_paused":
      return "Enter: resume · Esc: to menu · Tab: target player";
    case "kart_results":
    case "race_walk_results":
      return "↑↓: navigate · Enter: confirm · Tab: target player";
    case "race_walk":
      return "J: walk · L: run · P/Esc: pause · I/K: aim · F: fire · Tab: target";
    case "race_walk_paused":
      return "Enter: resume · Esc: to menu · Tab: target player";
    case "frogger":
      return "WASD or arrows: move · P/Esc: pause · Tab: target player";
    case "frogger_paused":
      return "Enter: resume · Esc: to menu · Tab: target player";
    case "frogger_results":
      return "↑↓: navigate · Enter: confirm · Tab: target player";
    case "bomberman":
      return "WASD or arrows: move · Space: bomb · P/Esc: pause · Tab: target player";
    case "bomberman_paused":
      return "Enter: resume · Esc: to menu · Tab: target player";
    case "bomberman_results":
      return "↑↓: navigate · Enter: confirm · Tab: target player";
    case "football_team_select":
      return "1 Red · 2 Blue · Enter START (2+ players) · Tab: target";
    case "football_summary":
      return "Watch TV — kickoff soon · Tab: target player";
    case "football":
      return "WASD or arrows: move · E: pass (when carrying) · P/Esc: pause · Tab: target player";
    case "football_paused":
      return "Enter: resume · Esc: to menu · Tab: target player";
    case "football_results":
      return "↑↓: navigate · Enter: confirm · Tab: target player";
    case "air_hockey_team_select":
      return "1 Red · 2 Blue · Enter START (2+ players) · Tab: target";
    case "air_hockey_summary":
      return "Watch TV — face-off soon · Tab: target player";
    case "air_hockey":
      return "WASD or arrows: move mallet · P/Esc: pause · Tab: target player";
    case "air_hockey_paused":
      return "Enter: resume · Esc: to menu · Tab: target player";
    case "air_hockey_results":
      return "↑↓: navigate · Enter: confirm · Tab: target player";
    default:
      return `${String(ph)} · Tab: target`;
  }
}

function sendIntent(ws: WebSocket, intent: ClientIntent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(intent));
  }
}

export function initDevKeyboardControllers(roomId: string, url: string, host: DevKeyboardHost): void {
  const { getPhase, getHostSnapshot } = host;
  const panel = document.querySelector<HTMLElement>("#dev-controller-panel");
  const select = document.querySelector<HTMLSelectElement>("#dev-control-select");
  const allReadyBtn = document.querySelector<HTMLButtonElement>("#dev-all-ready");
  const addBtn = document.querySelector<HTMLButtonElement>("#dev-add-controller");
  const hint = document.querySelector<HTMLElement>("#dev-keyboard-hint");
  const mnAddBtn = document.querySelector<HTMLButtonElement>("#dev-mn-add");
  const mnSettingsBtn = document.querySelector<HTMLButtonElement>("#dev-mn-settings");
  const stubBackBtn = document.querySelector<HTMLButtonElement>("#dev-stub-back");
  const settingsInline = document.querySelector<HTMLElement>("#dev-settings-inline");
  const kartSpeedInput = document.querySelector<HTMLInputElement>("#dev-set-kart-speed");
  const kartSpeedVal = document.querySelector<HTMLElement>("#dev-set-kart-speed-val");
  const settingsCloseBtn = document.querySelector<HTMLButtonElement>("#dev-settings-close");

  if (!panel || !select || !allReadyBtn || !addBtn) {
    console.warn("[dev] controller panel elements missing");
    return;
  }

  panel.hidden = false;
  if (hint) hint.hidden = false;

  if (kartSpeedInput) {
    kartSpeedInput.min = String(KART_FORWARD_SPEED_MIN);
    kartSpeedInput.max = String(KART_FORWARD_SPEED_MAX);
    kartSpeedInput.step = "5";
  }

  const slots: Slot[] = [];
  let activePlayerId: number | null = null;

  const keys = {
    left: false,
    right: false,
    jump: false,
    pause: false,
    rwWalk: false,
    rwRun: false,
    rwAimUp: false,
    rwAimDown: false,
    rwFire: false,
    fgAimUp: false,
    fgAimDown: false,
    kartBoost: false,
    footUp: false,
    footDown: false,
    footLeft: false,
    footRight: false,
    footPass: false,
    bmBomb: false,
  };

  function footballStickVector(forActive: boolean): { x: number; y: number } {
    if (!forActive) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    if (keys.footRight) x += 1;
    if (keys.footLeft) x -= 1;
    if (keys.footDown) y += 1;
    if (keys.footUp) y -= 1;
    return { x, y };
  }

  function activeWs(): WebSocket | null {
    const slot = slots.find((s) => s.playerId === activePlayerId);
    return slot?.ws && slot.ws.readyState === WebSocket.OPEN ? slot.ws : null;
  }

  function setKey(code: string, down: boolean): void {
    switch (code) {
      case "ArrowLeft":
      case "KeyA":
        keys.left = down;
        break;
      case "ArrowRight":
      case "KeyD":
        keys.right = down;
        break;
      case "ArrowUp":
      case "KeyW":
      case "Space":
        keys.jump = down;
        break;
      case "KeyP":
        keys.pause = down;
        break;
      case "KeyB":
        keys.kartBoost = down;
        break;
      default:
        return;
    }
  }

  const arrowNavKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

  function orderedPlayerIds(): number[] {
    return slots
      .map((s) => s.playerId)
      .filter((id): id is number => id !== null)
      .sort((a, b) => a - b);
  }

  window.addEventListener(
    "keydown",
    (e) => {
      const ph = getPhase();
      const snap = getHostSnapshot();

      if (e.target === select && arrowNavKeys.includes(e.key)) {
        e.preventDefault();
        select.blur();
      }

      if (e.key === "Tab") {
        const ready = orderedPlayerIds();
        if (ready.length >= 2) {
          e.preventDefault();
          let idx = activePlayerId !== null ? ready.indexOf(activePlayerId) : 0;
          if (idx < 0) idx = 0;
          const next = e.shiftKey
            ? (idx - 1 + ready.length) % ready.length
            : (idx + 1) % ready.length;
          activePlayerId = ready[next];
          select.value = String(activePlayerId);
          select.blur();
          return;
        }
      }

      const ws = activeWs();
      if (ws && !e.repeat) {
        if (snap.settingsOpen) {
          if (e.code === "Escape" || e.code === "F4") {
            e.preventDefault();
            sendIntent(ws, { type: "settings_close" });
            return;
          }
          if (e.code === "Minus" || e.code === "NumpadSubtract") {
            e.preventDefault();
            const cur = resolveKartForwardSpeed(snap.gameSettings);
            const next = clampKartForwardSpeed(cur - 5);
            sendIntent(ws, { type: "game_settings_patch", patch: { kartForwardSpeed: next } });
            return;
          }
          if (e.code === "Equal" || e.code === "NumpadAdd") {
            e.preventDefault();
            const cur = resolveKartForwardSpeed(snap.gameSettings);
            const next = clampKartForwardSpeed(cur + 5);
            sendIntent(ws, { type: "game_settings_patch", patch: { kartForwardSpeed: next } });
            return;
          }
        }

        if (!snap.settingsOpen) {
          if (e.code === "F2") {
            e.preventDefault();
            sendIntent(ws, { type: "menu_add_players" });
            return;
          }
          if (e.code === "F3") {
            e.preventDefault();
            sendIntent(ws, { type: "menu_game_settings" });
            return;
          }
        }

        if (!snap.settingsOpen && ph === "menu") {
          if (e.code === "Escape") {
            e.preventDefault();
            sendIntent(ws, { type: "menu_help_close" });
            return;
          }
          if (e.code === "KeyH") {
            e.preventDefault();
            sendIntent(ws, { type: "menu_help_open" });
            return;
          }
        }

        if (
          !snap.settingsOpen &&
          (ph === "menu" ||
            ph === "kart_results" ||
            ph === "race_walk_results" ||
            ph === "frogger_results" ||
            ph === "bomberman_results" ||
            ph === "football_results" ||
            ph === "air_hockey_results")
        ) {
          if (e.code === "ArrowUp") {
            e.preventDefault();
            sendIntent(ws, { type: "menu_nav", dir: "up" });
            return;
          }
          if (e.code === "ArrowDown") {
            e.preventDefault();
            sendIntent(ws, { type: "menu_nav", dir: "down" });
            return;
          }
          if (e.code === "Enter") {
            e.preventDefault();
            sendIntent(ws, { type: "menu_confirm" });
            return;
          }
        }
        if (ph === "lobby" && (e.code === "KeyR" || e.code === "Enter")) {
          e.preventDefault();
          sendIntent(ws, { type: "all_ready" });
          return;
        }
        if (ph === "stub" && e.code === "Escape") {
          e.preventDefault();
          sendIntent(ws, { type: "stub_back" });
          return;
        }
        if (ph === "kart" && e.code === "Escape") {
          e.preventDefault();
          keys.pause = true;
          setTimeout(() => {
            keys.pause = false;
          }, 100);
          return;
        }
        if (ph === "race_walk" && (e.code === "KeyP" || e.code === "Escape")) {
          e.preventDefault();
          keys.pause = true;
          setTimeout(() => {
            keys.pause = false;
          }, 100);
          return;
        }
        if (ph === "frogger" && (e.code === "KeyP" || e.code === "Escape")) {
          e.preventDefault();
          keys.pause = true;
          setTimeout(() => {
            keys.pause = false;
          }, 100);
          return;
        }
        if (ph === "bomberman" && (e.code === "KeyP" || e.code === "Escape")) {
          e.preventDefault();
          keys.pause = true;
          setTimeout(() => {
            keys.pause = false;
          }, 100);
          return;
        }
        if (ph === "bomberman" && e.code === "Space") {
          e.preventDefault();
          keys.bmBomb = true;
          setTimeout(() => {
            keys.bmBomb = false;
          }, 100);
          return;
        }
        if (ph === "football" && (e.code === "KeyP" || e.code === "Escape")) {
          e.preventDefault();
          keys.pause = true;
          setTimeout(() => {
            keys.pause = false;
          }, 100);
          return;
        }
        if (ph === "air_hockey" && (e.code === "KeyP" || e.code === "Escape")) {
          e.preventDefault();
          keys.pause = true;
          setTimeout(() => {
            keys.pause = false;
          }, 100);
          return;
        }
        if (ph === "football_team_select" && !snap.settingsOpen) {
          if (e.code === "Digit1" || e.code === "Numpad1") {
            e.preventDefault();
            sendIntent(ws, { type: "football_pick_team", team: "red" });
            return;
          }
          if (e.code === "Digit2" || e.code === "Numpad2") {
            e.preventDefault();
            sendIntent(ws, { type: "football_pick_team", team: "blue" });
            return;
          }
          if (e.code === "Enter") {
            e.preventDefault();
            sendIntent(ws, { type: "football_start" });
            return;
          }
        }
        if (ph === "air_hockey_team_select" && !snap.settingsOpen) {
          if (e.code === "Digit1" || e.code === "Numpad1") {
            e.preventDefault();
            sendIntent(ws, { type: "air_hockey_pick_team", team: "red" });
            return;
          }
          if (e.code === "Digit2" || e.code === "Numpad2") {
            e.preventDefault();
            sendIntent(ws, { type: "air_hockey_pick_team", team: "blue" });
            return;
          }
          if (e.code === "Enter") {
            e.preventDefault();
            sendIntent(ws, { type: "air_hockey_start" });
            return;
          }
        }
        if (ph === "kart_paused" || ph === "race_walk_paused" || ph === "frogger_paused" || ph === "bomberman_paused") {
          if (e.code === "Enter") {
            e.preventDefault();
            sendIntent(ws, { type: "pause_resume" });
            return;
          }
          if (e.code === "Escape") {
            e.preventDefault();
            sendIntent(ws, { type: "pause_to_menu" });
            return;
          }
        }
        if (ph === "football_paused" || ph === "air_hockey_paused") {
          if (e.code === "Enter") {
            e.preventDefault();
            sendIntent(ws, { type: "pause_resume" });
            return;
          }
          if (e.code === "Escape") {
            e.preventDefault();
            sendIntent(ws, { type: "pause_to_menu" });
            return;
          }
        }
      }

      if (e.repeat) return;

      if (
        ph === "menu" ||
        ph === "kart_results" ||
        ph === "race_walk_results" ||
        ph === "frogger_results" ||
        ph === "bomberman_results" ||
        ph === "football_results" ||
        ph === "air_hockey_results" ||
        ph === "football_team_select" ||
        ph === "air_hockey_team_select"
      ) {
        return;
      }

      if (ph === "frogger" || ph === "bomberman") {
        if (e.code === "ArrowUp" || e.code === "KeyW") {
          e.preventDefault();
          keys.fgAimUp = true;
          return;
        }
        if (e.code === "ArrowDown" || e.code === "KeyS") {
          e.preventDefault();
          keys.fgAimDown = true;
          return;
        }
      }

      if (ph === "race_walk") {
        if (e.code === "KeyJ") {
          e.preventDefault();
          keys.rwWalk = true;
          return;
        }
        if (e.code === "KeyL") {
          e.preventDefault();
          keys.rwRun = true;
          return;
        }
        if (e.code === "KeyI") {
          e.preventDefault();
          keys.rwAimUp = true;
          return;
        }
        if (e.code === "KeyK") {
          e.preventDefault();
          keys.rwAimDown = true;
          return;
        }
        if (e.code === "KeyF") {
          e.preventDefault();
          keys.rwFire = true;
          setTimeout(() => {
            keys.rwFire = false;
          }, 100);
          return;
        }
      }

      if (ph === "football") {
        if (e.code === "KeyE") {
          e.preventDefault();
          keys.footPass = true;
          setTimeout(() => {
            keys.footPass = false;
          }, 100);
          return;
        }
      }

      if (ph === "football" || ph === "air_hockey") {
        if (e.code === "KeyW" || e.code === "ArrowUp") {
          e.preventDefault();
          keys.footUp = true;
          return;
        }
        if (e.code === "KeyS" || e.code === "ArrowDown") {
          e.preventDefault();
          keys.footDown = true;
          return;
        }
        if (e.code === "KeyA" || e.code === "ArrowLeft") {
          e.preventDefault();
          keys.footLeft = true;
          return;
        }
        if (e.code === "KeyD" || e.code === "ArrowRight") {
          e.preventDefault();
          keys.footRight = true;
          return;
        }
      }

      if (
        ph !== "frogger" &&
        ph !== "frogger_paused" &&
        ph !== "bomberman" &&
        ph !== "bomberman_paused" &&
        ph !== "football" &&
        ph !== "football_paused" &&
        ph !== "air_hockey" &&
        ph !== "air_hockey_paused"
      ) {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW", "KeyP", "KeyB"].includes(e.code)
        ) {
          e.preventDefault();
        }
        setKey(e.code, true);
      } else if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "KeyP"].includes(e.code)) {
        e.preventDefault();
        setKey(e.code, true);
      }
    },
    true
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (e.code === "KeyJ") keys.rwWalk = false;
      if (e.code === "KeyL") keys.rwRun = false;
      if (e.code === "KeyI") keys.rwAimUp = false;
      if (e.code === "KeyK") keys.rwAimDown = false;
      if (e.code === "ArrowUp" || e.code === "KeyW") keys.fgAimUp = false;
      if (e.code === "ArrowDown" || e.code === "KeyS") keys.fgAimDown = false;
      if (e.code === "KeyW" || e.code === "ArrowUp") keys.footUp = false;
      if (e.code === "KeyS" || e.code === "ArrowDown") keys.footDown = false;
      if (e.code === "KeyA" || e.code === "ArrowLeft") keys.footLeft = false;
      if (e.code === "KeyD" || e.code === "ArrowRight")     keys.footRight = false;
      setKey(e.code, false);
    },
    true
  );

  window.addEventListener("blur", () => {
    keys.left = false;
    keys.right = false;
    keys.jump = false;
    keys.pause = false;
    keys.rwWalk = false;
    keys.rwRun = false;
    keys.rwAimUp = false;
    keys.rwAimDown = false;
    keys.rwFire = false;
    keys.fgAimUp = false;
    keys.fgAimDown = false;
    keys.kartBoost = false;
    keys.footUp = false;
    keys.footDown = false;
    keys.footLeft = false;
    keys.footRight = false;
    keys.footPass = false;
    keys.bmBomb = false;
  });

  function syncSelectOptions(): void {
    const prev = select.value;
    select.innerHTML = "";
    const ready = slots.filter((s) => s.playerId !== null);
    for (const s of ready) {
      const id = s.playerId!;
      const opt = document.createElement("option");
      opt.value = String(id);
      opt.textContent = `Player ${id}`;
      select.appendChild(opt);
    }
    if (ready.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Connecting…";
      select.appendChild(opt);
      select.disabled = true;
      return;
    }
    select.disabled = false;
    const still = ready.some((s) => String(s.playerId) === prev);
    if (still) select.value = prev;
    else if (activePlayerId !== null && ready.some((s) => s.playerId === activePlayerId)) {
      select.value = String(activePlayerId);
    } else {
      select.value = String(ready[0].playerId);
      activePlayerId = ready[0].playerId;
    }
  }

  select.addEventListener("change", () => {
    const v = select.value;
    activePlayerId = v === "" ? null : Number(v);
    select.blur();
  });

  function sampleBinary(forActive: boolean): { h: number; buttons: number } {
    if (!forActive) return { h: 0, buttons: 0 };
    const ph = getPhase();
    let h = 0;
    if (keys.left && !keys.right) h = -127;
    else if (keys.right && !keys.left) h = 127;
    if (ph === "kart") {
      let buttons = keys.pause ? Btn.Pause : 0;
      if (keys.kartBoost) buttons |= Btn.Boost;
      return { h, buttons };
    }
    if (ph === "kart_paused") {
      return { h, buttons: keys.pause ? Btn.Pause : 0 };
    }
    if (ph === "race_walk") {
      let buttons = 0;
      if (keys.rwWalk) buttons |= Btn.Jump;
      if (keys.rwRun) buttons |= Btn.Run;
      if (keys.pause) buttons |= Btn.Pause;
      if (keys.rwAimUp) buttons |= Btn.AimUp;
      if (keys.rwAimDown) buttons |= Btn.AimDown;
      if (keys.rwFire) buttons |= Btn.Fire;
      return { h: 0, buttons };
    }
    if (ph === "frogger") {
      let buttons = 0;
      if (keys.fgAimUp) buttons |= Btn.AimUp;
      if (keys.fgAimDown) buttons |= Btn.AimDown;
      if (keys.pause) buttons |= Btn.Pause;
      return { h, buttons };
    }
    if (ph === "bomberman") {
      let buttons = 0;
      if (keys.fgAimUp) buttons |= Btn.AimUp;
      if (keys.fgAimDown) buttons |= Btn.AimDown;
      if (keys.bmBomb) buttons |= Btn.Fire;
      if (keys.pause) buttons |= Btn.Pause;
      return { h, buttons };
    }
    return { h, buttons: keys.jump ? Btn.Jump : 0 };
  }

  function attachControllerSocket(ws: WebSocket, slot: Slot): void {
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
      ws.send(encodeJoin("controller", roomId));
    });

    ws.addEventListener("message", (ev) => {
      if (typeof ev.data === "string") {
        // Pre-join controller_state: auto-create a player using the server's suggested defaults.
        try {
          const st = JSON.parse(ev.data) as { type?: string; playerId?: number; prejoin?: { suggestedName: string; suggestedHue: number } };
          if (st.type === "controller_state" && st.playerId === 0 && st.prejoin && !slot.didPrejoin) {
            slot.didPrejoin = true;
            sendIntent(ws, { type: "prejoin_create", name: st.prejoin.suggestedName, hue: st.prejoin.suggestedHue });
          }
        } catch {
          /* ignore */
        }
        return;
      }

      const data = ev.data as ArrayBuffer;
      if (new DataView(data).getUint8(0) !== Op.ServerWelcome) return;
      try {
        const { playerId } = parseWelcome(data);
        // Ignore the initial welcome(0) for pre-join.
        if (playerId === 0) return;
        slot.playerId = playerId;
        if (activePlayerId === null) activePlayerId = playerId;
        syncSelectOptions();
      } catch {
        /* ignore */
      }
    });

    ws.addEventListener("close", () => {
      const idx = slots.indexOf(slot);
      if (idx >= 0) slots.splice(idx, 1);
      if (activePlayerId === slot.playerId) activePlayerId = null;
      syncSelectOptions();
      const first = slots.find((s) => s.playerId !== null);
      if (first?.playerId != null) {
        activePlayerId = first.playerId;
        syncSelectOptions();
      }
    });
  }

  function addController(): void {
    const ws = new WebSocket(url);
    const slot: Slot = { ws, seq: 0, playerId: null, didPrejoin: false };
    slots.push(slot);
    attachControllerSocket(ws, slot);
    syncSelectOptions();
  }

  addBtn.addEventListener("click", () => addController());

  allReadyBtn.addEventListener("click", () => {
    const ws = activeWs();
    if (ws) sendIntent(ws, { type: "all_ready" });
  });

  mnAddBtn?.addEventListener("click", () => {
    const ws = activeWs();
    if (ws) sendIntent(ws, { type: "menu_add_players" });
  });
  mnSettingsBtn?.addEventListener("click", () => {
    const ws = activeWs();
    if (ws) sendIntent(ws, { type: "menu_game_settings" });
  });
  stubBackBtn?.addEventListener("click", () => {
    const ws = activeWs();
    if (ws) sendIntent(ws, { type: "stub_back" });
  });
  settingsCloseBtn?.addEventListener("click", () => {
    const ws = activeWs();
    if (ws) sendIntent(ws, { type: "settings_close" });
  });
  kartSpeedInput?.addEventListener("input", () => {
    const ws = activeWs();
    if (!ws || !kartSpeedVal) return;
    const n = Number(kartSpeedInput.value);
    kartSpeedVal.textContent = String(n);
    sendIntent(ws, { type: "game_settings_patch", patch: { kartForwardSpeed: n } });
  });

  function loop(): void {
    const ph = getPhase();
    const snap = getHostSnapshot();

    if (stubBackBtn) stubBackBtn.hidden = ph !== "stub";
    if (settingsInline) settingsInline.hidden = !snap.settingsOpen;
    if (kartSpeedInput && kartSpeedVal && snap.settingsOpen) {
      const v = resolveKartForwardSpeed(snap.gameSettings);
      if (document.activeElement !== kartSpeedInput) {
        kartSpeedInput.value = String(v);
      }
      kartSpeedVal.textContent = String(resolveKartForwardSpeed(snap.gameSettings));
    }

    if (hint) {
      hint.textContent = devHintForScreen(ph, snap);
    }

    for (const slot of slots) {
      if (slot.ws.readyState !== WebSocket.OPEN || slot.playerId === null) continue;
      slot.seq = (slot.seq + 1) >>> 0;
      const forActive = activePlayerId !== null && slot.playerId === activePlayerId;
      if (
        ph === "menu" ||
        ph === "stub" ||
        ph === "kart_results" ||
        ph === "race_walk_results" ||
        ph === "frogger_results" ||
        ph === "bomberman_results" ||
        ph === "football_team_select" ||
        ph === "football_summary" ||
        ph === "football_results" ||
        ph === "air_hockey_team_select" ||
        ph === "air_hockey_summary" ||
        ph === "air_hockey_results" ||
        ph === "kart_paused" ||
        ph === "race_walk_paused" ||
        ph === "frogger_paused" ||
        ph === "bomberman_paused" ||
        snap.settingsOpen
      ) {
        slot.ws.send(encodeInput(slot.seq, 0, 0));
        continue;
      }
      if (ph === "football") {
        const { x, y } = footballStickVector(forActive);
        const packed = joystickToPackedFootballAxis(x, y);
        let buttons = keys.pause ? Btn.Pause : 0;
        if (keys.footPass) buttons |= Btn.Pass;
        slot.ws.send(encodeFootballAxis(slot.seq, packed, buttons));
        continue;
      }
      if (ph === "air_hockey") {
        const { x, y } = footballStickVector(forActive);
        const packed = joystickToPackedFootballAxis(x, y);
        const buttons = keys.pause ? Btn.Pause : 0;
        slot.ws.send(encodeFootballAxis(slot.seq, packed, buttons));
        continue;
      }
      if (ph === "football_paused" || ph === "air_hockey_paused") {
        slot.ws.send(encodeFootballAxis(slot.seq, joystickToPackedFootballAxis(0, 0), 0));
        continue;
      }
      const { h, buttons } = sampleBinary(forActive);
      slot.ws.send(encodeInput(slot.seq, h, buttons));
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  addController();
}
