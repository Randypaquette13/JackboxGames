import {
  MINIGAME_IDS,
  MINIGAME_LABELS,
  MINIGAME_META,
  type ClientIntent,
  type ControllerStateJson,
  type MinigameId,
} from "@shared/messages";
import { MINIGAME_HELP } from "@shared/minigameHelp";
import {
  FOOTBALL_GAME_PERIOD_SEC_MAX,
  FOOTBALL_GAME_PERIOD_SEC_MIN,
  FOOTBALL_GAME_SPEED_MAX,
  FOOTBALL_GAME_SPEED_MIN,
  FOOTBALL_GAME_TD_TO_WIN_MAX,
  FOOTBALL_GAME_TD_TO_WIN_MIN,
  resolveFootballMaxPlayerSpeed,
  resolveFootballPeriodSec,
  resolveFootballTdToWin,
} from "@shared/footballGameSettings";
import {
  AIR_HOCKEY_GAME_GOALS_TO_WIN_MAX,
  AIR_HOCKEY_GAME_GOALS_TO_WIN_MIN,
  AIR_HOCKEY_GAME_PERIOD_SEC_MAX,
  AIR_HOCKEY_GAME_PERIOD_SEC_MIN,
  AIR_HOCKEY_GAME_SPEED_MAX,
  AIR_HOCKEY_GAME_SPEED_MIN,
  resolveAirHockeyGoalsToWin,
  resolveAirHockeyMaxPlayerSpeed,
  resolveAirHockeyPeriodSec,
} from "@shared/airHockeyGameSettings";
import {
  PACMAN_GAME_LIVES_MAX,
  PACMAN_GAME_LIVES_MIN,
  resolvePacmanLivesPerPlayer,
} from "@shared/pacmanGameSettings";
import {
  KART_FORWARD_SPEED_MAX,
  KART_FORWARD_SPEED_MIN,
  resolveKartForwardSpeed,
} from "@shared/kartSettings";
import {
  Btn,
  encodeFootballAxis,
  encodeInput,
  encodeJoin,
  encodePing,
  Op,
  parseError,
  parseWelcome,
} from "@shared/protocol";
import {
  FOOTBALL_JOYSTICK_LEN_DEADZONE,
  FOOTBALL_JOYSTICK_LEN_RUN_END,
  FOOTBALL_JOYSTICK_LEN_WALK_END,
  FOOTBALL_JOYSTICK_SURFACE_FRAC,
  joystickToPackedFootballAxis,
} from "@shared/footballPackedInput";

function wsUrl(): string {
  const p = location.protocol === "https:" ? "wss:" : "ws:";
  return `${p}//${location.host}/ws`;
}

const MINIGAME_SECTION_CLASS: Record<MinigameId, string> = {
  kart: "settings-section-kart",
  race_walk: "settings-section-race-walk",
  frogger: "settings-section-frogger",
  football: "settings-section-football",
  air_hockey: "settings-section-air-hockey",
  bomberman: "settings-section-bomberman",
  pacman: "settings-section-pacman",
};

/** Block iOS Safari double-tap and pinch zoom — breaks game/controller taps. */
function preventMobileBrowserZoom(): void {
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      if ((e.target as Element | null)?.closest(
        "#panel-menu, #panel-settings, .menu-help-scroll, input, textarea, select"
      )) return;
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );
  document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
}

preventMobileBrowserZoom();

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
  menuHelp: document.querySelector<HTMLElement>("#panel-menu-help")!,
  stub: document.querySelector<HTMLElement>("#panel-stub")!,
  raceWalk: document.querySelector<HTMLElement>("#panel-race-walk")!,
  frogger: document.querySelector<HTMLElement>("#panel-frogger")!,
  bomberman: document.querySelector<HTMLElement>("#panel-bomberman")!,
  pacman: document.querySelector<HTMLElement>("#panel-pacman")!,
  footballTeams: document.querySelector<HTMLElement>("#panel-football-teams")!,
  football: document.querySelector<HTMLElement>("#panel-football")!,
  airHockeyTeams: document.querySelector<HTMLElement>("#panel-air-hockey-teams")!,
  airHockey: document.querySelector<HTMLElement>("#panel-air-hockey")!,
  kart: document.querySelector<HTMLElement>("#panel-kart")!,
  kartPause: document.querySelector<HTMLElement>("#panel-kart-pause")!,
  results: document.querySelector<HTMLElement>("#panel-results")!,
  settings: document.querySelector<HTMLElement>("#panel-settings")!,
};

const fgDeathBanner = document.querySelector<HTMLElement>("#fg-death-banner")!;
const fgDeathSub = document.querySelector<HTMLElement>("#fg-death-sub")!;
const bmDeathBanner = document.querySelector<HTMLElement>("#bm-death-banner")!;
const bmDeathSub = document.querySelector<HTMLElement>("#bm-death-sub")!;
const bmHandToggleBtn = document.querySelector<HTMLButtonElement>("#bm-hand-toggle")!;
const BM_LEFTY_KEY = "jb_bomberman_lefty";
const pmDeathBanner = document.querySelector<HTMLElement>("#pm-death-banner")!;
const pmDeathSub = document.querySelector<HTMLElement>("#pm-death-sub")!;
const pmHudEl = document.querySelector<HTMLElement>("#pm-hud")!;

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
const menuScrollWrapEl = document.querySelector<HTMLElement>("#menu-scroll-wrap")!;
const resultsHintEl = document.querySelector<HTMLElement>("#results-hint")!;
const resultsListEl = document.querySelector<HTMLElement>("#results-list")!;
const rwFireBtn = document.querySelector<HTMLButtonElement>("#rw-fire")!;
const rwStatusEl = document.querySelector<HTMLElement>("#rw-status")!;
const ktBoostBtn = document.querySelector<HTMLButtonElement>("#kt-boost")!;
const ktBoostHint = document.querySelector<HTMLElement>("#kt-boost-hint")!;

const fbTeamTopEl = document.querySelector<HTMLElement>("#fb-team-top")!;
const fbTeamSubEl = document.querySelector<HTMLElement>("#fb-team-sub")!;
const fbTeamRedBtn = document.querySelector<HTMLButtonElement>("#fb-team-red")!;
const fbTeamBlueBtn = document.querySelector<HTMLButtonElement>("#fb-team-blue")!;
const fbStartGameBtn = document.querySelector<HTMLButtonElement>("#fb-start-game")!;
const fbStartHintEl = document.querySelector<HTMLElement>("#fb-start-hint")!;
const fbPlayHudEl = document.querySelector<HTMLElement>("#fb-play-hud")!;
const fbJoystickEl = document.querySelector<HTMLElement>("#fb-joystick")!;
const fbKnobEl = document.querySelector<HTMLElement>("#fb-knob")!;

const ahTeamTopEl = document.querySelector<HTMLElement>("#ah-team-top")!;
const ahTeamSubEl = document.querySelector<HTMLElement>("#ah-team-sub")!;
const ahTeamRedBtn = document.querySelector<HTMLButtonElement>("#ah-team-red")!;
const ahTeamBlueBtn = document.querySelector<HTMLButtonElement>("#ah-team-blue")!;
const ahStartGameBtn = document.querySelector<HTMLButtonElement>("#ah-start-game")!;
const ahStartHintEl = document.querySelector<HTMLElement>("#ah-start-hint")!;
const ahPlayHudEl = document.querySelector<HTMLElement>("#ah-play-hud")!;
const ahJoystickEl = document.querySelector<HTMLElement>("#ah-joystick")!;
const ahKnobEl = document.querySelector<HTMLElement>("#ah-knob")!;

/** SVG rings aligned to shared speed tiers (same normalization as stick clamp). */
function injectFootballJoystickZones(base: HTMLElement, knob: HTMLElement): void {
  if (base.querySelector("svg.vj-zones")) return;
  const cx = 50;
  const cy = 50;
  const rMax = 50 * FOOTBALL_JOYSTICK_SURFACE_FRAC;
  const tiers: { r: number; className: string }[] = [
    { r: rMax * FOOTBALL_JOYSTICK_LEN_DEADZONE, className: "vj-ring vj-ring-dead" },
    { r: rMax * FOOTBALL_JOYSTICK_LEN_WALK_END, className: "vj-ring vj-ring-walk" },
    { r: rMax * FOOTBALL_JOYSTICK_LEN_RUN_END, className: "vj-ring vj-ring-run" },
    /** Outer puck rim; annulus outside run ring is full-speed tier */
    { r: rMax, className: "vj-ring vj-ring-max" },
  ];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("class", "vj-zones");
  svg.setAttribute("aria-hidden", "true");
  for (const { r, className } of tiers) {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", r.toFixed(2));
    c.setAttribute("class", className);
    svg.appendChild(c);
  }
  base.insertBefore(svg, knob);
}
injectFootballJoystickZones(fbJoystickEl, fbKnobEl);
injectFootballJoystickZones(ahJoystickEl, ahKnobEl);

const RESULT_LABELS = ["Play again", "Back to minigame select", "Add more controllers"];

const kartSpeedInput = document.querySelector<HTMLInputElement>("#set-kart-speed")!;
const kartSpeedVal = document.querySelector<HTMLElement>("#set-kart-speed-val")!;
kartSpeedInput.min = String(KART_FORWARD_SPEED_MIN);
kartSpeedInput.max = String(KART_FORWARD_SPEED_MAX);
kartSpeedInput.step = "5";

const fbPeriodInput = document.querySelector<HTMLInputElement>("#set-football-period")!;
const fbPeriodVal = document.querySelector<HTMLElement>("#set-football-period-val")!;
fbPeriodInput.min = String(FOOTBALL_GAME_PERIOD_SEC_MIN);
fbPeriodInput.max = String(FOOTBALL_GAME_PERIOD_SEC_MAX);
fbPeriodInput.step = "15";

const fbTdInput = document.querySelector<HTMLInputElement>("#set-football-td")!;
const fbTdVal = document.querySelector<HTMLElement>("#set-football-td-val")!;
fbTdInput.min = String(FOOTBALL_GAME_TD_TO_WIN_MIN);
fbTdInput.max = String(FOOTBALL_GAME_TD_TO_WIN_MAX);
fbTdInput.step = "1";

const fbSpeedInput = document.querySelector<HTMLInputElement>("#set-football-speed")!;
const fbSpeedVal = document.querySelector<HTMLElement>("#set-football-speed-val")!;
fbSpeedInput.min = String(FOOTBALL_GAME_SPEED_MIN);
fbSpeedInput.max = String(FOOTBALL_GAME_SPEED_MAX);
fbSpeedInput.step = "5";

const ahGoalsInput = document.querySelector<HTMLInputElement>("#set-air-hockey-goals")!;
const ahGoalsVal = document.querySelector<HTMLElement>("#set-air-hockey-goals-val")!;
ahGoalsInput.min = String(AIR_HOCKEY_GAME_GOALS_TO_WIN_MIN);
ahGoalsInput.max = String(AIR_HOCKEY_GAME_GOALS_TO_WIN_MAX);
ahGoalsInput.step = "1";

const ahPeriodInput = document.querySelector<HTMLInputElement>("#set-air-hockey-period")!;
const ahPeriodVal = document.querySelector<HTMLElement>("#set-air-hockey-period-val")!;
ahPeriodInput.min = String(AIR_HOCKEY_GAME_PERIOD_SEC_MIN);
ahPeriodInput.max = String(AIR_HOCKEY_GAME_PERIOD_SEC_MAX);
ahPeriodInput.step = "15";

const ahSpeedInput = document.querySelector<HTMLInputElement>("#set-air-hockey-speed")!;
const ahSpeedVal = document.querySelector<HTMLElement>("#set-air-hockey-speed-val")!;
ahSpeedInput.min = String(AIR_HOCKEY_GAME_SPEED_MIN);
ahSpeedInput.max = String(AIR_HOCKEY_GAME_SPEED_MAX);
ahSpeedInput.step = "5";

const pmLivesInput = document.querySelector<HTMLInputElement>("#set-pacman-lives")!;
const pmLivesVal = document.querySelector<HTMLElement>("#set-pacman-lives-val")!;

const settingsScrollEl = document.querySelector<HTMLElement>("#panel-settings .settings-scroll")!;
const settingsScrollWrapEl = document.querySelector<HTMLElement>("#panel-settings .settings-scroll-wrap")!;

const menuLockPanels = [
  panels.menu,
  panels.menuHelp,
  panels.settings,
  panels.results,
] as const;

function canControlMenu(st: ControllerStateJson | null): boolean {
  if (!st || st.playerId === 0) return false;
  if (st.menuControllerId === null) return true;
  return st.menuControllerId === st.playerId;
}

function syncMenuLock(st: ControllerStateJson | null): void {
  const locked =
    st !== null &&
    st.menuControllerId !== null &&
    st.playerId !== 0 &&
    st.menuControllerId !== st.playerId;
  const label = st?.menuControllerName ?? (st?.menuControllerId ? `P${st.menuControllerId}` : "");
  const text = locked ? `${label} is controlling the menu` : "";
  for (const panel of menuLockPanels) {
    const banner = panel.querySelector<HTMLElement>(".menu-lock-banner");
    if (banner) {
      banner.hidden = !locked;
      banner.textContent = text;
    }
    panel.classList.toggle("menu-locked", locked);
  }
}

function updatePanelScrollHint(scrollEl: HTMLElement, wrapEl: HTMLElement): void {
  const canScroll = scrollEl.scrollHeight > scrollEl.clientHeight + 4;
  const atBottom =
    scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 10;
  wrapEl.classList.toggle("can-scroll", canScroll);
  wrapEl.classList.toggle("at-bottom", atBottom);
}

function updateSettingsScrollHint(): void {
  if (!settingsScrollEl || !settingsScrollWrapEl) return;
  updatePanelScrollHint(settingsScrollEl, settingsScrollWrapEl);
}

function updateMinigameMenuScrollHint(): void {
  if (!menuScrollWrapEl) return;
  updatePanelScrollHint(menuScrollWrapEl, menuScrollWrapEl);
}

function findMinigamePickAt(clientX: number, clientY: number): HTMLElement | null {
  for (const pick of menuListEl.querySelectorAll<HTMLElement>(".minigame-pick")) {
    const r = pick.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
      return pick;
    }
  }
  return null;
}

function syncMinigamePickRow(row: HTMLElement, selected: boolean): void {
  row.classList.toggle("selected", selected);
  const status = row.querySelector<HTMLElement>(".minigame-pick-status");
  if (status) status.textContent = selected ? "Selected" : "Tap to select";
}
pmLivesInput.min = String(PACMAN_GAME_LIVES_MIN);
pmLivesInput.max = String(PACMAN_GAME_LIVES_MAX);
pmLivesInput.step = "1";

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
  /** Ignore RED/BLUE taps briefly after menu→team UI swap (avoids confirm release “click” hitting a team). */
  let footballTeamPickLockUntil = 0;
  let airHockeyTeamPickLockUntil = 0;
  let prevWsPhase: ControllerStateJson["phase"] | null = null;
  let prejoinMode: "resume" | "create" = "resume";
  let prejoinTouched = { name: false, hue: false };
  let renderedMinigameMenuKey = "";
  /** When true, next selection update may scroll the selected row into view (nav buttons only). */
  let minigameScrollSelectedIntoView = false;

  function minigameMenuRenderKey(st: ControllerStateJson): string {
    const items =
      st.menuItems.length > 0 ? st.menuItems.map((item) => item.id).join(",") : MINIGAME_IDS.join(",");
    return `${st.menuIndex}|${items}`;
  }

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
  let kBoost = false;
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
  ktBoostBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    kBoost = true;
    setTimeout(() => {
      kBoost = false;
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

  let bmUp = false;
  let bmDown = false;
  let bmLeft = false;
  let bmRight = false;
  let bmBomb = false;
  let bmPause = false;
  bindHold(
    document.querySelector("#bm-up")!,
    () => {
      bmUp = true;
    },
    () => {
      bmUp = false;
    }
  );
  bindHold(
    document.querySelector("#bm-down")!,
    () => {
      bmDown = true;
    },
    () => {
      bmDown = false;
    }
  );
  bindHold(
    document.querySelector("#bm-left")!,
    () => {
      bmLeft = true;
    },
    () => {
      bmLeft = false;
    }
  );
  bindHold(
    document.querySelector("#bm-right")!,
    () => {
      bmRight = true;
    },
    () => {
      bmRight = false;
    }
  );
  document.querySelector("#bm-bomb")!.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    bmBomb = true;
    setTimeout(() => {
      bmBomb = false;
    }, 100);
  });
  document.querySelector("#bm-pause")!.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    bmPause = true;
    setTimeout(() => {
      bmPause = false;
    }, 100);
  });

  function applyBombermanHandPref(lefty: boolean): void {
    panels.bomberman.classList.toggle("bomberman-lefty", lefty);
    bmHandToggleBtn.textContent = lefty ? "⇄ Right hand" : "⇄ Left hand";
    bmHandToggleBtn.setAttribute("aria-pressed", lefty ? "true" : "false");
    try {
      localStorage.setItem(BM_LEFTY_KEY, lefty ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }
  applyBombermanHandPref(localStorage.getItem(BM_LEFTY_KEY) === "1");
  bmHandToggleBtn.addEventListener("click", () => {
    applyBombermanHandPref(!panels.bomberman.classList.contains("bomberman-lefty"));
  });

  let pmUp = false;
  let pmDown = false;
  let pmLeft = false;
  let pmRight = false;
  let pmPause = false;
  bindHold(
    document.querySelector("#pm-up")!,
    () => {
      pmUp = true;
    },
    () => {
      pmUp = false;
    }
  );
  bindHold(
    document.querySelector("#pm-down")!,
    () => {
      pmDown = true;
    },
    () => {
      pmDown = false;
    }
  );
  bindHold(
    document.querySelector("#pm-left")!,
    () => {
      pmLeft = true;
    },
    () => {
      pmLeft = false;
    }
  );
  bindHold(
    document.querySelector("#pm-right")!,
    () => {
      pmRight = true;
    },
    () => {
      pmRight = false;
    }
  );
  document.querySelector("#pm-pause")!.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pmPause = true;
    setTimeout(() => {
      pmPause = false;
    }, 100);
  });

  let fbPause = false;
  document.querySelector("#fb-pause")!.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    fbPause = true;
    setTimeout(() => {
      fbPause = false;
    }, 100);
  });

  let fbPass = false;
  document.querySelector("#fb-pass")!.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    fbPass = true;
    setTimeout(() => {
      fbPass = false;
    }, 100);
  });

  let ahPause = false;
  document.querySelector("#ah-pause")!.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    ahPause = true;
    setTimeout(() => {
      ahPause = false;
    }, 100);
  });

  let fbStickX = 0;
  let fbStickY = 0;

  function updateFbKnobVisual(): void {
    const rect = fbJoystickEl.getBoundingClientRect();
    const radius = Math.max(24, (Math.min(rect.width, rect.height) / 2) * FOOTBALL_JOYSTICK_SURFACE_FRAC);
    const dx = fbStickX * radius;
    const dy = fbStickY * radius;
    fbKnobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  function centerFbStick(): void {
    fbStickX = 0;
    fbStickY = 0;
    updateFbKnobVisual();
  }

  function moveFbStickFromClient(clientX: number, clientY: number): void {
    const r = fbJoystickEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = Math.max(24, (Math.min(r.width, r.height) / 2) * FOOTBALL_JOYSTICK_SURFACE_FRAC);
    let nx = (clientX - cx) / max;
    let ny = (clientY - cy) / max;
    const len = Math.hypot(nx, ny);
    if (len > 1) {
      nx /= len;
      ny /= len;
    }
    fbStickX = nx;
    fbStickY = ny;
    updateFbKnobVisual();
  }

  fbJoystickEl.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      fbJoystickEl.setPointerCapture(e.pointerId);
      moveFbStickFromClient(e.clientX, e.clientY);
    },
    { passive: false }
  );
  fbJoystickEl.addEventListener("pointermove", (e) => {
    if (!fbJoystickEl.hasPointerCapture(e.pointerId)) return;
    moveFbStickFromClient(e.clientX, e.clientY);
  });
  fbJoystickEl.addEventListener("pointerup", centerFbStick);
  fbJoystickEl.addEventListener("pointercancel", centerFbStick);

  let ahStickX = 0;
  let ahStickY = 0;

  function updateAhKnobVisual(): void {
    const rect = ahJoystickEl.getBoundingClientRect();
    const radius = Math.max(24, (Math.min(rect.width, rect.height) / 2) * FOOTBALL_JOYSTICK_SURFACE_FRAC);
    const dx = ahStickX * radius;
    const dy = ahStickY * radius;
    ahKnobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  function centerAhStick(): void {
    ahStickX = 0;
    ahStickY = 0;
    updateAhKnobVisual();
  }

  function moveAhStickFromClient(clientX: number, clientY: number): void {
    const r = ahJoystickEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const max = Math.max(24, (Math.min(r.width, r.height) / 2) * FOOTBALL_JOYSTICK_SURFACE_FRAC);
    let nx = (clientX - cx) / max;
    let ny = (clientY - cy) / max;
    const len = Math.hypot(nx, ny);
    if (len > 1) {
      nx /= len;
      ny /= len;
    }
    ahStickX = nx;
    ahStickY = ny;
    updateAhKnobVisual();
  }

  ahJoystickEl.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      ahJoystickEl.setPointerCapture(e.pointerId);
      moveAhStickFromClient(e.clientX, e.clientY);
    },
    { passive: false }
  );
  ahJoystickEl.addEventListener("pointermove", (e) => {
    if (!ahJoystickEl.hasPointerCapture(e.pointerId)) return;
    moveAhStickFromClient(e.clientX, e.clientY);
  });
  ahJoystickEl.addEventListener("pointerup", centerAhStick);
  ahJoystickEl.addEventListener("pointercancel", centerAhStick);

  const ws = new WebSocket(`${wsUrl()}?cid=${encodeURIComponent(controllerClientId)}`);
  ws.binaryType = "arraybuffer";

  function syncGameSettingsFromState(st: ControllerStateJson): void {
    const k = resolveKartForwardSpeed(st.gameSettings);
    kartSpeedInput.value = String(k);
    kartSpeedVal.textContent = String(k);

    const period = resolveFootballPeriodSec(st.gameSettings);
    fbPeriodInput.value = String(period);
    const pm = Math.floor(period / 60);
    const ps = period % 60;
    fbPeriodVal.textContent = `${pm}:${String(ps).padStart(2, "0")}`;

    const td = resolveFootballTdToWin(st.gameSettings);
    fbTdInput.value = String(td);
    fbTdVal.textContent = String(td);

    const fbs = resolveFootballMaxPlayerSpeed(st.gameSettings);
    fbSpeedInput.value = String(fbs);
    fbSpeedVal.textContent = String(fbs);

    const ahGoals = resolveAirHockeyGoalsToWin(st.gameSettings);
    ahGoalsInput.value = String(ahGoals);
    ahGoalsVal.textContent = String(ahGoals);

    const ahPeriod = resolveAirHockeyPeriodSec(st.gameSettings);
    ahPeriodInput.value = String(ahPeriod);
    const apm = Math.floor(ahPeriod / 60);
    const aps = ahPeriod % 60;
    ahPeriodVal.textContent = `${apm}:${String(aps).padStart(2, "0")}`;

    const ahs = resolveAirHockeyMaxPlayerSpeed(st.gameSettings);
    ahSpeedInput.value = String(ahs);
    ahSpeedVal.textContent = String(ahs);

    const pmLives = resolvePacmanLivesPerPlayer(st.gameSettings);
    pmLivesInput.value = String(pmLives);
    pmLivesVal.textContent = String(pmLives);
  }

  function hideAll(): void {
    Object.values(panels).forEach((p) => {
      if (p) p.hidden = true;
    });
  }

  const fallbackMenuItems = MINIGAME_IDS.map((id) => ({ id, label: MINIGAME_LABELS[id] }));

  function renderMenuHelp(st: ControllerStateJson): void {
    const titleEl = document.querySelector<HTMLElement>("#menu-help-title")!;
    const bodyEl = document.querySelector<HTMLElement>("#menu-help-body")!;
    const items =
      st.menuItems.length > 0 ? st.menuItems : MINIGAME_IDS.map((id) => ({ id, label: MINIGAME_LABELS[id] }));
    const n = items.length;
    const idx = n <= 0 ? 0 : ((st.menuIndex % n) + n) % n;
    const id = items[idx]!.id as MinigameId;
    const copy = MINIGAME_HELP[id];
    titleEl.textContent = `${MINIGAME_LABELS[id]} — How to play`;
    bodyEl.textContent = "";
    const addSection = (heading: string, bullets: string[]): void => {
      const h = document.createElement("div");
      h.className = "menu-help-section-title";
      h.textContent = heading;
      bodyEl.appendChild(h);
      const ul = document.createElement("ul");
      ul.className = "menu-help-ul";
      for (const line of bullets) {
        const li = document.createElement("li");
        li.textContent = line;
        ul.appendChild(li);
      }
      bodyEl.appendChild(ul);
    };
    addSection("Rules", copy.rules);
    addSection("Controls (phone)", copy.controls);
  }

  function renderMinigameMenu(st: ControllerStateJson | null, opts?: { force?: boolean }): void {
    if (!st) return;
    const renderKey = minigameMenuRenderKey(st);
    const selectionChanged = renderKey !== renderedMinigameMenuKey;
    if (!opts?.force && !selectionChanged) return;

    const items = st.menuItems.length > 0 ? st.menuItems : fallbackMenuItems;
    const n = items.length;
    const idxRaw = st.menuIndex ?? 0;
    const idx = n <= 0 ? 0 : ((idxRaw % n) + n) % n;

    const existingPicks = menuListEl.querySelectorAll<HTMLElement>(".minigame-pick");
    if (!opts?.force && existingPicks.length === n && existingPicks.length > 0) {
      existingPicks.forEach((row, i) => syncMinigamePickRow(row, i === idx));
      renderedMinigameMenuKey = renderKey;
      requestAnimationFrame(() => {
        if (selectionChanged && minigameScrollSelectedIntoView) {
          menuListEl.querySelector<HTMLElement>(".minigame-pick.selected")?.scrollIntoView({
            block: "nearest",
          });
        }
        minigameScrollSelectedIntoView = false;
        updateMinigameMenuScrollHint();
        requestAnimationFrame(updateMinigameMenuScrollHint);
      });
      return;
    }

    renderedMinigameMenuKey = renderKey;
    menuListEl.textContent = "";
    items.forEach((item, i) => {
      const id = item.id as MinigameId;
      const meta = MINIGAME_META[id];
      const selected = i === idx;

      const section = document.createElement("section");
      section.className = `settings-section ${MINIGAME_SECTION_CLASS[id]}`;

      const title = document.createElement("h2");
      title.className = "settings-section-title";
      title.textContent = `${meta?.icon ?? "🎮"} ${item.label}`;

      const card = document.createElement("div");
      card.className = "settings-card";

      const row = document.createElement("div");
      row.className = `settings-row minigame-pick${selected ? " selected" : ""}`;
      row.dataset.gameId = id;
      row.dataset.menuIndex = String(i);

      const head = document.createElement("div");
      head.className = "settings-row-head";

      const label = document.createElement("span");
      label.textContent = "Pick this game";

      const status = document.createElement("span");
      status.className = "settings-val minigame-pick-status";
      status.textContent = selected ? "Selected" : "Tap to select";

      head.appendChild(label);
      head.appendChild(status);

      row.appendChild(head);
      card.appendChild(row);
      section.appendChild(title);
      section.appendChild(card);
      menuListEl.appendChild(section);
    });
    requestAnimationFrame(() => {
      if (selectionChanged && minigameScrollSelectedIntoView) {
        menuListEl.querySelector<HTMLElement>(".minigame-pick.selected")?.scrollIntoView({
          block: "nearest",
        });
      }
      minigameScrollSelectedIntoView = false;
      updateMinigameMenuScrollHint();
      requestAnimationFrame(updateMinigameMenuScrollHint);
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
      case "bomberman_results":
        return "Bomberman finished";
      case "pacman_results":
        return "Pac-Man finished";
      case "football_results":
        return "Football finished";
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

  function syncBombermanPanelState(st: ControllerStateJson | null): void {
    const bm = st?.bomberman;
    const tick = st?.tick ?? 0;
    if (!bm) {
      bmDeathBanner.hidden = true;
      bmDeathSub.textContent = "";
      return;
    }
    const noticeOk = bm.deathNotice && tick < bm.deathNotice.untilTick;
    const showDead =
      !bm.alive &&
      (noticeOk ||
        st?.phase === "bomberman" ||
        st?.phase === "bomberman_paused" ||
        st?.phase === "bomberman_results");
    if (showDead) {
      bmDeathBanner.hidden = false;
      bmDeathSub.textContent = noticeOk ? bm.deathNotice!.text : "Spectating…";
    } else {
      bmDeathBanner.hidden = true;
      bmDeathSub.textContent = "";
    }
  }

  function syncPacmanPanelState(st: ControllerStateJson | null): void {
    const pm = st?.pacman;
    const tick = st?.tick ?? 0;
    if (!pm) {
      pmDeathBanner.hidden = true;
      pmDeathSub.textContent = "";
      pmHudEl.textContent = "";
      return;
    }
    const noticeOk = pm.deathNotice && tick < pm.deathNotice.untilTick;
    const showDead =
      !pm.alive &&
      (noticeOk ||
        st?.phase === "pacman" ||
        st?.phase === "pacman_paused" ||
        st?.phase === "pacman_results");
    if (showDead) {
      pmDeathBanner.hidden = false;
      pmDeathSub.textContent = noticeOk
        ? pm.deathNotice!.text
        : pm.lives > 0
          ? "Respawning…"
          : "Out of lives!";
    } else {
      pmDeathBanner.hidden = true;
      pmDeathSub.textContent = "";
    }
    const fright =
      pm.frightenedSecLeft !== null ? ` · Frightened ${pm.frightenedSecLeft.toFixed(1)}s` : "";
    pmHudEl.textContent = `Lives ${pm.lives} · Score ${pm.score} · Pellets ${pm.pelletsRemaining}${fright}`;
  }

  function syncKartPanelState(st: ControllerStateJson | null): void {
    const kart = st?.kart;
    const ph = st?.phase;
    if (!kart || ph !== "kart") {
      ktBoostBtn.disabled = true;
      ktBoostHint.textContent = "";
      return;
    }
    const countdownActive = kart.countdown !== null && kart.countdown > 0;
    const canUse =
      !kart.paused && !countdownActive && kart.boostsRemaining > 0;
    ktBoostBtn.disabled = !canUse;
    if (kart.boosting) {
      ktBoostHint.textContent = "Boosting!";
      ktBoostHint.style.color = "#ffb347";
    } else if (countdownActive) {
      ktBoostHint.textContent = "Boost unlocks after GO!";
      ktBoostHint.style.color = "";
    } else {
      ktBoostHint.textContent = `Boosts left: ${kart.boostsRemaining}`;
      ktBoostHint.style.color = "";
    }
  }

  function syncFootballUi(st: ControllerStateJson | null): void {
    const fb = st?.football;
    const ph = forcedControllerPhase ?? st?.phase ?? "lobby";

    fbTeamRedBtn.classList.toggle("my-pick", fb?.myTeam === "red");
    fbTeamBlueBtn.classList.toggle("my-pick", fb?.myTeam === "blue");

    if (ph === "football_team_select" && fb) {
      fbTeamTopEl.textContent = "Football — pick your team";
      fbTeamSubEl.textContent = "";
      fbStartGameBtn.hidden = false;
      fbStartGameBtn.disabled = !fb.canStart;
      fbTeamRedBtn.disabled = false;
      fbTeamBlueBtn.disabled = false;
      fbStartHintEl.textContent = fb.canStart
        ? "START locks teams and kicks off on the TV. Unpicked players are auto-balanced."
        : "Need at least two joined players.";
    } else if (ph === "football_summary" && fb) {
      fbTeamTopEl.textContent = "Football — teams locked";
      fbTeamSubEl.textContent = "Kickoff coming — glance at the host screen.";
      fbStartGameBtn.hidden = true;
      fbTeamRedBtn.disabled = true;
      fbTeamBlueBtn.disabled = true;
      fbStartHintEl.textContent = "";
    }

    if (fb && (ph === "football" || ph === "football_paused")) {
      const m = Math.floor(fb.timeLeftSec / 60);
      const sec = fb.timeLeftSec % 60;
      const clk = `${m}:${String(sec).padStart(2, "0")}`;
      const td = fb.tdToWin;
      fbPlayHudEl.textContent = fb.timerExpired
        ? `${clk} — overtime: next tackle or TD ends it · RED ${fb.redScore}/${td} — BLUE ${fb.blueScore}/${td}`
        : `${clk} · RED ${fb.redScore}/${td} — BLUE ${fb.blueScore}/${td}`;
    } else {
      fbPlayHudEl.textContent = "";
    }
  }

  function syncAirHockeyUi(st: ControllerStateJson | null): void {
    const ah = st?.airHockey;
    const ph = forcedControllerPhase ?? st?.phase ?? "lobby";

    ahTeamRedBtn.classList.toggle("my-pick", ah?.myTeam === "red");
    ahTeamBlueBtn.classList.toggle("my-pick", ah?.myTeam === "blue");

    if (ph === "air_hockey_team_select" && ah) {
      ahTeamTopEl.textContent = "Air Hockey — pick your side";
      ahTeamSubEl.textContent = "";
      ahStartGameBtn.hidden = false;
      ahStartGameBtn.disabled = !ah.canStart;
      ahTeamRedBtn.disabled = false;
      ahTeamBlueBtn.disabled = false;
      ahStartHintEl.textContent = ah.canStart
        ? "START locks sides and faces off on the TV. Unpicked players are auto-balanced."
        : "Need at least two joined players.";
    } else if (ph === "air_hockey_summary" && ah) {
      ahTeamTopEl.textContent = "Air Hockey — sides locked";
      ahTeamSubEl.textContent = "Face-off coming — glance at the host screen.";
      ahStartGameBtn.hidden = true;
      ahTeamRedBtn.disabled = true;
      ahTeamBlueBtn.disabled = true;
      ahStartHintEl.textContent = "";
    }

    if (ah && (ph === "air_hockey" || ph === "air_hockey_paused")) {
      const m = Math.floor(ah.timeLeftSec / 60);
      const sec = ah.timeLeftSec % 60;
      const clk = `${m}:${String(sec).padStart(2, "0")}`;
      const g = ah.goalsToWin;
      ahPlayHudEl.textContent = ah.timerExpired
        ? `${clk} — overtime: next goal ends it · RED ${ah.redScore}/${g} — BLUE ${ah.blueScore}/${g}`
        : `${clk} · RED ${ah.redScore}/${g} — BLUE ${ah.blueScore}/${g}`;
    } else {
      ahPlayHudEl.textContent = "";
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
    syncKartPanelState(st);
    syncRaceWalkPanelState(st);
    syncFroggerPanelState(st);
    syncBombermanPanelState(st);
    syncPacmanPanelState(st);
    syncFootballUi(st);
    syncAirHockeyUi(st);
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
      syncGameSettingsFromState(st);
      panels.settings.hidden = false;
      syncMenuLock(st);
      requestAnimationFrame(() => {
        updateSettingsScrollHint();
        requestAnimationFrame(updateSettingsScrollHint);
      });
      return;
    }
    const ph = forcedControllerPhase ?? st.phase;
    if (ph !== "menu" || st.menuHelpOpen) {
      renderedMinigameMenuKey = "";
    }
    if (ph !== "football") centerFbStick();
    if (ph !== "air_hockey") centerAhStick();
    if (ph === "lobby") {
      panels.lobby.hidden = false;
    } else if (ph === "menu") {
      if (st.menuHelpOpen) {
        panels.menuHelp.hidden = false;
        renderMenuHelp(st);
      } else {
        panels.menu.hidden = false;
        renderMinigameMenu(st);
        updateMinigameMenuScrollHint();
        requestAnimationFrame(() => {
          updateMinigameMenuScrollHint();
          requestAnimationFrame(updateMinigameMenuScrollHint);
        });
      }
    } else if (ph === "stub") {
      panels.stub.hidden = false;
    } else if (ph === "race_walk") {
      panels.raceWalk.hidden = false;
    } else if (ph === "frogger") {
      panels.frogger.hidden = false;
    } else if (ph === "bomberman") {
      panels.bomberman.hidden = false;
    } else if (ph === "pacman") {
      panels.pacman.hidden = false;
    } else if (ph === "football_team_select" || ph === "football_summary") {
      panels.footballTeams.hidden = false;
    } else if (ph === "football") {
      panels.football.hidden = false;
    } else if (ph === "air_hockey_team_select" || ph === "air_hockey_summary") {
      panels.airHockeyTeams.hidden = false;
    } else if (ph === "air_hockey") {
      panels.airHockey.hidden = false;
    } else if (ph === "kart") {
      panels.kart.hidden = false;
    } else if (
      ph === "kart_paused" ||
      ph === "race_walk_paused" ||
      ph === "frogger_paused" ||
      ph === "bomberman_paused" ||
      ph === "pacman_paused" ||
      ph === "football_paused" ||
      ph === "air_hockey_paused"
    ) {
      panels.kartPause.hidden = false;
    } else if (
      ph === "kart_results" ||
      ph === "race_walk_results" ||
      ph === "frogger_results" ||
      ph === "bomberman_results" ||
      ph === "pacman_results" ||
      ph === "football_results" ||
      ph === "air_hockey_results"
    ) {
      panels.results.hidden = false;
      renderResultsMenu(st);
    }
    syncMenuLock(st);
  }

  function showMenuPanelImmediately(): void {
    hideAll();
    panels.menu.hidden = false;
    renderedMinigameMenuKey = "";
    minigameScrollSelectedIntoView = true;
    renderMinigameMenu(ctrlState, { force: true });
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
          if (ctrlState.phase === "football_team_select" && prevWsPhase !== "football_team_select") {
            footballTeamPickLockUntil = performance.now() + 420;
          }
          if (ctrlState.phase === "air_hockey_team_select" && prevWsPhase !== "air_hockey_team_select") {
            airHockeyTeamPickLockUntil = performance.now() + 420;
          }
          prevWsPhase = ctrlState.phase;
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
    if (!canControlMenu(ctrlState)) return;
    minigameScrollSelectedIntoView = true;
    sendJson(ws, { type: "menu_nav", dir: "up" });
  });
  bindPointerTap(document.querySelector("#mn-down")!, () => {
    if (!canControlMenu(ctrlState)) return;
    minigameScrollSelectedIntoView = true;
    sendJson(ws, { type: "menu_nav", dir: "down" });
  });
  bindPointerTap(document.querySelector("#mn-confirm")!, () => {
    if (!canControlMenu(ctrlState)) return;
    sendJson(ws, { type: "menu_confirm" });
  });
  document.querySelector("#mn-howto")!.addEventListener("click", () => {
    if (!canControlMenu(ctrlState)) return;
    sendJson(ws, { type: "menu_help_open" });
  });
  document.querySelector("#menu-help-back")!.addEventListener("click", () => {
    if (!canControlMenu(ctrlState)) return;
    sendJson(ws, { type: "menu_help_close" });
  });
  document.querySelector("#mn-add")!.addEventListener("click", () => {
    if (!canControlMenu(ctrlState)) return;
    sendJson(ws, { type: "menu_add_players" });
  });
  document.querySelector("#mn-settings")!.addEventListener("click", () => {
    if (!canControlMenu(ctrlState)) return;
    sendJson(ws, { type: "menu_game_settings" });
  });

  function isMinigameMenuPhase(): boolean {
    if (!ctrlState) return false;
    return (forcedControllerPhase ?? ctrlState.phase) === "menu";
  }

  function tryMinigamePickFromElement(pick: HTMLElement): void {
    if (!ctrlState || ws.readyState !== WebSocket.OPEN) return;
    if (!isMinigameMenuPhase()) return;
    if (!canControlMenu(ctrlState)) return;

    const idx = Number(pick.dataset.menuIndex);
    if (!Number.isFinite(idx) || idx < 0) return;
    sendJson(ws, { type: "menu_select", index: idx });
  }

  menuScrollWrapEl.addEventListener("click", (e) => {
    const pick = findMinigamePickAt(e.clientX, e.clientY);
    if (pick) tryMinigamePickFromElement(pick);
  });

  menuScrollWrapEl.addEventListener("scroll", updateMinigameMenuScrollHint, { passive: true });

  window.addEventListener("resize", updateMinigameMenuScrollHint);

  function tryFootballPickTeam(team: "red" | "blue"): void {
    if (performance.now() < footballTeamPickLockUntil) return;
    sendJson(ws, { type: "football_pick_team", team });
  }
  bindPointerTap(fbTeamRedBtn, () => tryFootballPickTeam("red"));
  bindPointerTap(fbTeamBlueBtn, () => tryFootballPickTeam("blue"));
  fbStartGameBtn.addEventListener("click", () => {
    sendJson(ws, { type: "football_start" });
  });

  function tryAirHockeyPickTeam(team: "red" | "blue"): void {
    if (performance.now() < airHockeyTeamPickLockUntil) return;
    sendJson(ws, { type: "air_hockey_pick_team", team });
  }
  bindPointerTap(ahTeamRedBtn, () => tryAirHockeyPickTeam("red"));
  bindPointerTap(ahTeamBlueBtn, () => tryAirHockeyPickTeam("blue"));
  ahStartGameBtn.addEventListener("click", () => {
    sendJson(ws, { type: "air_hockey_start" });
  });

  function sendTeamSelectBack(): void {
    sendJson(ws, { type: "team_select_back" });
  }
  document.querySelector("#fb-team-back")!.addEventListener("click", sendTeamSelectBack);
  document.querySelector("#ah-team-back")!.addEventListener("click", sendTeamSelectBack);

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
    if (!canControlMenu(ctrlState)) return;
    const ph = forcedControllerPhase ?? ctrlState.phase;
    const menuLike =
      ph === "menu" ||
      ph === "kart_results" ||
      ph === "race_walk_results" ||
      ph === "frogger_results" ||
      ph === "bomberman_results" ||
      ph === "pacman_results" ||
      ph === "football_results" ||
      ph === "air_hockey_results";
    if (!menuLike) return;
    const el = e.target as HTMLElement | null;
    if (el?.closest("input, textarea, select")) return;
    if (e.repeat) return;

    if (e.code === "ArrowUp") {
      e.preventDefault();
      if (ph === "menu") minigameScrollSelectedIntoView = true;
      sendJson(ws, { type: "menu_nav", dir: "up" });
      return;
    }
    if (e.code === "ArrowDown") {
      e.preventDefault();
      if (ph === "menu") minigameScrollSelectedIntoView = true;
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

  settingsScrollEl.addEventListener("scroll", updateSettingsScrollHint, { passive: true });
  window.addEventListener("resize", updateSettingsScrollHint);

  kartSpeedInput.addEventListener("input", () => {
    const n = Number(kartSpeedInput.value);
    kartSpeedVal.textContent = String(n);
    sendJson(ws, { type: "game_settings_patch", patch: { kartForwardSpeed: n } });
  });

  fbPeriodInput.addEventListener("input", () => {
    const n = Number(fbPeriodInput.value);
    const pm = Math.floor(n / 60);
    const ps = n % 60;
    fbPeriodVal.textContent = `${pm}:${String(ps).padStart(2, "0")}`;
    sendJson(ws, { type: "game_settings_patch", patch: { footballPeriodSec: n } });
  });

  fbTdInput.addEventListener("input", () => {
    const n = Number(fbTdInput.value);
    fbTdVal.textContent = String(n);
    sendJson(ws, { type: "game_settings_patch", patch: { footballTdToWin: n } });
  });

  fbSpeedInput.addEventListener("input", () => {
    const n = Number(fbSpeedInput.value);
    fbSpeedVal.textContent = String(n);
    sendJson(ws, { type: "game_settings_patch", patch: { footballMaxPlayerSpeed: n } });
  });

  ahGoalsInput.addEventListener("input", () => {
    const n = Number(ahGoalsInput.value);
    ahGoalsVal.textContent = String(n);
    sendJson(ws, { type: "game_settings_patch", patch: { airHockeyGoalsToWin: n } });
  });

  ahPeriodInput.addEventListener("input", () => {
    const n = Number(ahPeriodInput.value);
    const pm = Math.floor(n / 60);
    const ps = n % 60;
    ahPeriodVal.textContent = `${pm}:${String(ps).padStart(2, "0")}`;
    sendJson(ws, { type: "game_settings_patch", patch: { airHockeyPeriodSec: n } });
  });

  ahSpeedInput.addEventListener("input", () => {
    const n = Number(ahSpeedInput.value);
    ahSpeedVal.textContent = String(n);
    sendJson(ws, { type: "game_settings_patch", patch: { airHockeyMaxPlayerSpeed: n } });
  });

  pmLivesInput.addEventListener("input", () => {
    const n = Number(pmLivesInput.value);
    pmLivesVal.textContent = String(n);
    sendJson(ws, { type: "game_settings_patch", patch: { pacmanLivesPerPlayer: n } });
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
      } else if (ph === "football") {
        const packed = joystickToPackedFootballAxis(fbStickX, fbStickY);
        let buttons = 0;
        if (fbPause) buttons |= Btn.Pause;
        if (fbPass) buttons |= Btn.Pass;
        ws.send(encodeFootballAxis(seq, packed, buttons));
      } else if (ph === "football_paused") {
        ws.send(encodeFootballAxis(seq, joystickToPackedFootballAxis(0, 0), 0));
      } else if (ph === "air_hockey") {
        const packed = joystickToPackedFootballAxis(ahStickX, ahStickY);
        let buttons = 0;
        if (ahPause) buttons |= Btn.Pause;
        ws.send(encodeFootballAxis(seq, packed, buttons));
      } else if (ph === "air_hockey_paused") {
        ws.send(encodeFootballAxis(seq, joystickToPackedFootballAxis(0, 0), 0));
      } else if (ph === "kart") {
        let h = 0;
        if (kLeft && !kRight) h = -127;
        else if (kRight && !kLeft) h = 127;
        let buttons = 0;
        if (kPause) buttons |= Btn.Pause;
        if (kBoost) buttons |= Btn.Boost;
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
      } else if (ph === "bomberman") {
        let h = 0;
        if (bmLeft && !bmRight) h = -127;
        else if (bmRight && !bmLeft) h = 127;
        let buttons = 0;
        if (bmUp) buttons |= Btn.AimUp;
        if (bmDown) buttons |= Btn.AimDown;
        if (bmBomb) buttons |= Btn.Fire;
        if (bmPause) buttons |= Btn.Pause;
        ws.send(encodeInput(seq, h, buttons));
      } else if (ph === "pacman") {
        let h = 0;
        if (pmLeft && !pmRight) h = -127;
        else if (pmRight && !pmLeft) h = 127;
        let buttons = 0;
        if (pmUp) buttons |= Btn.AimUp;
        if (pmDown) buttons |= Btn.AimDown;
        if (pmPause) buttons |= Btn.Pause;
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
