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

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room")?.trim();

const statusEl = document.querySelector<HTMLElement>("#status")!;
const controlsEl = document.querySelector<HTMLElement>("#controls")!;
const btnLeft = document.querySelector<HTMLButtonElement>("#btn-left")!;
const btnRight = document.querySelector<HTMLButtonElement>("#btn-right")!;
const btnJump = document.querySelector<HTMLButtonElement>("#btn-jump")!;

if (!roomId) {
  statusEl.textContent = "Missing ?room= in URL. Scan the QR on the host screen.";
} else {
  let left = false;
  let right = false;
  let jump = false;
  let seq = 0;

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
    btnLeft,
    () => {
      left = true;
    },
    () => {
      left = false;
    }
  );
  bindHold(
    btnRight,
    () => {
      right = true;
    },
    () => {
      right = false;
    }
  );
  bindHold(
    btnJump,
    () => {
      jump = true;
    },
    () => {
      jump = false;
    }
  );

  const ws = new WebSocket(wsUrl());
  ws.binaryType = "arraybuffer";

  ws.addEventListener("open", () => {
    statusEl.textContent = "Connected — use on-screen controls";
    controlsEl.hidden = false;
    ws.send(encodeJoin("controller", roomId));
  });

  ws.addEventListener("message", (ev) => {
    const data = ev.data as ArrayBuffer;
    const op = new DataView(data).getUint8(0);
    if (op === Op.ServerWelcome) {
      parseWelcome(data);
      return;
    }
    if (op === Op.ServerError) {
      statusEl.textContent = parseError(data);
      controlsEl.hidden = true;
    }
  });

  ws.addEventListener("close", () => {
    statusEl.textContent = "Disconnected";
    controlsEl.hidden = true;
  });

  function sampleInput(): { h: number; buttons: number } {
    let h = 0;
    if (left && !right) h = -127;
    else if (right && !left) h = 127;
    const buttons = jump ? Btn.Jump : 0;
    return { h, buttons };
  }

  function loop(): void {
    if (ws.readyState === WebSocket.OPEN) {
      seq = (seq + 1) >>> 0;
      const { h, buttons } = sampleInput();
      ws.send(encodeInput(seq, h, buttons));
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
