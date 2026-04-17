/**
 * Dev controllers: multiple WS connections; keyboard mirrors phone (binary + JSON).
 * Lobby: A/D or arrows move, Space/W jump, R or “All players joined” = all ready.
 * Menu / results: arrows navigate, Enter = confirm, Tab cycles target player.
 * Kart: A/D steer, P or Esc = pause edge.
 */
import type { ClientIntent, GamePhase } from "@shared/messages";
import { Btn, encodeInput, encodeJoin, Op, parseWelcome } from "@shared/protocol";

type Slot = {
  ws: WebSocket;
  seq: number;
  playerId: number | null;
};

function sendIntent(ws: WebSocket, intent: ClientIntent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(intent));
  }
}

export function initDevKeyboardControllers(
  roomId: string,
  url: string,
  getPhase: () => GamePhase
): void {
  const panel = document.querySelector<HTMLElement>("#dev-controller-panel");
  const select = document.querySelector<HTMLSelectElement>("#dev-control-select");
  const allReadyBtn = document.querySelector<HTMLButtonElement>("#dev-all-ready");
  const addBtn = document.querySelector<HTMLButtonElement>("#dev-add-controller");
  const hint = document.querySelector<HTMLElement>("#dev-keyboard-hint");

  if (!panel || !select || !allReadyBtn || !addBtn) {
    console.warn("[dev] controller panel elements missing");
    return;
  }

  panel.hidden = false;
  if (hint) hint.hidden = false;

  const slots: Slot[] = [];
  let activePlayerId: number | null = null;

  const keys = { left: false, right: false, jump: false, pause: false };

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
        if (ph === "menu" || ph === "kart_results") {
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
        if (ph === "lobby" && e.code === "KeyR") {
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
        if (ph === "kart_paused") {
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

      if (ph === "menu" || ph === "kart_results") {
        return;
      }

      if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW", "KeyP"].includes(e.code)) {
        e.preventDefault();
      }
      setKey(e.code, true);
    },
    true
  );

  window.addEventListener(
    "keyup",
    (e) => {
      setKey(e.code, false);
    },
    true
  );

  window.addEventListener("blur", () => {
    keys.left = false;
    keys.right = false;
    keys.jump = false;
    keys.pause = false;
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
    if (ph === "kart" || ph === "kart_paused") {
      return { h, buttons: keys.pause ? Btn.Pause : 0 };
    }
    return { h, buttons: keys.jump ? Btn.Jump : 0 };
  }

  function attachControllerSocket(ws: WebSocket, slot: Slot): void {
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
      ws.send(encodeJoin("controller", roomId));
    });

    ws.addEventListener("message", (ev) => {
      const data = ev.data as ArrayBuffer;
      if (new DataView(data).getUint8(0) !== Op.ServerWelcome) return;
      try {
        const { playerId } = parseWelcome(data);
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
    const slot: Slot = { ws, seq: 0, playerId: null };
    slots.push(slot);
    attachControllerSocket(ws, slot);
    syncSelectOptions();
  }

  addBtn.addEventListener("click", () => addController());

  allReadyBtn.addEventListener("click", () => {
    const ws = activeWs();
    if (ws) sendIntent(ws, { type: "all_ready" });
  });

  function loop(): void {
    const ph = getPhase();
    for (const slot of slots) {
      if (slot.ws.readyState !== WebSocket.OPEN || slot.playerId === null) continue;
      slot.seq = (slot.seq + 1) >>> 0;
      const forActive = activePlayerId !== null && slot.playerId === activePlayerId;
      if (ph === "menu" || ph === "stub" || ph === "kart_results") {
        slot.ws.send(encodeInput(slot.seq, 0, 0));
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
