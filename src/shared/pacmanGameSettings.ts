/** Default lives per player when starting a Pac-Man round. */
export const PACMAN_LIVES_PER_PLAYER = 1;

/** Room `gameSettings.pacmanLivesPerPlayer`. */
export const PACMAN_GAME_LIVES_MIN = 1;
export const PACMAN_GAME_LIVES_MAX = 9;

export function clampPacmanLivesPerPlayer(n: number): number {
  return Math.max(PACMAN_GAME_LIVES_MIN, Math.min(PACMAN_GAME_LIVES_MAX, Math.round(n)));
}

export function resolvePacmanLivesPerPlayer(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.pacmanLivesPerPlayer;
  if (typeof v === "number" && Number.isFinite(v)) return clampPacmanLivesPerPlayer(v);
  return PACMAN_LIVES_PER_PLAYER;
}
