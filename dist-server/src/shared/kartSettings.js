/** Allowed range for room `gameSettings.kartForwardSpeed` (kart cruise / open-track recovery target). */
export const KART_FORWARD_SPEED_MIN = 80;
export const KART_FORWARD_SPEED_MAX = 280;
/** Default when `gameSettings.kartForwardSpeed` is unset (matches base kart physics). */
export const KART_FORWARD_SPEED_DEFAULT = 140;
export function clampKartForwardSpeed(n) {
    return Math.max(KART_FORWARD_SPEED_MIN, Math.min(KART_FORWARD_SPEED_MAX, Math.round(n)));
}
export function resolveKartForwardSpeed(gameSettings) {
    const v = gameSettings.kartForwardSpeed;
    if (typeof v === "number" && Number.isFinite(v))
        return clampKartForwardSpeed(v);
    return KART_FORWARD_SPEED_DEFAULT;
}
/** Boost charges per race (server + UI). */
export const KART_BOOST_USES_PER_RACE = 2;
/** Target cruise multiplier while boost timer is active. */
export const KART_BOOST_SPEED_MULT = 1.55;
/** How long each boost lasts (seconds). */
export const KART_BOOST_DURATION_SEC = 2.25;
/** Immediate forward-speed bump on activation, as a fraction of base cruise. */
export const KART_BOOST_INITIAL_KICK_FRAC = 0.32;
