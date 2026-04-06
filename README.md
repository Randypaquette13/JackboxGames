# Phone-as-controller platform demo

Jackbox-style flow: open the **host** page on a desktop or TV, scan the **QR code** with phones, and use the **controller** page as a virtual gamepad. The game runs as a **2D platformer** with **authoritative physics on the server** at 60 Hz.

## Quick start (local)

1. Copy `.env.example` to `.env` and adjust if needed.
2. Run `npm install` and `npm run dev`.
3. Open `http://127.0.0.1:5173/` (Vite). The QR uses `VITE_PUBLIC_BASE_URL` when set; otherwise it uses the current browser origin (fine for same-machine tests).
4. Open or scan the join link on a phone **after** the host page has connected (the host creates the room).

**Production-style (single port):** `npm run build` then `npm start` and open `http://127.0.0.1:3001/`. The server serves `dist/` and WebSockets on the same port.

## Tunnel (ngrok / Cloudflare) for phones on the internet

Phones must reach the same **HTTPS** origin your browser uses, and WebSockets must use **WSS**.

1. Start the stack with `npm run dev` (or `npm run build` + `npm start`).
2. Point a tunnel at the **Vite dev port** (`5173`) for development, or at **`3001`** if you use `npm start` after a build.
3. Set **`VITE_PUBLIC_BASE_URL`** in `.env` to your tunnel’s public **HTTPS** origin (no trailing slash), e.g. `https://abc123.ngrok-free.app`. Restart Vite so the client bundle picks it up; **rebuild** after changing this for production (`npm run build`).
4. Open the **tunneled HTTPS URL** for the host page. The QR encodes `…/join.html?room=…` on that same host so phones load the controller over **HTTPS** and connect to **`wss://…/ws`** through the tunnel.

**Cloudflare Tunnel:** run `cloudflared tunnel --url http://localhost:5173` (or `:3001` for single-port mode) and use the printed `https://…` URL as `VITE_PUBLIC_BASE_URL`.

**ngrok:** `ngrok http 5173` (or `3001`), then set `VITE_PUBLIC_BASE_URL` to the `https://…` forwarding URL.

Ensure your tunnel provider **allows WebSockets** on that path (both ngrok and Cloudflare Tunnel support this for HTTP upgrades).

## Latency-oriented choices

- **Binary WebSocket frames** for join, input, ping, and state (no `JSON.stringify` on the input hot path).
- **`TCP_NODELAY`** on each accepted socket (see `setTcpNoDelay` in `server/index.ts`).
- **60 Hz** fixed simulation tick; controllers stream input at **display refresh** via `requestAnimationFrame`.
- **Host RTT** from periodic binary ping/pong (shown in the HUD).

## Scripts

| Script        | Description                                      |
| ------------- | ------------------------------------------------ |
| `npm run dev` | Game server (`tsx watch`) + Vite (port `5173`)   |
| `npm run build` | TypeScript compile for server + Vite client bundle |
| `npm start`   | Run compiled server; serves `dist/` + `/ws` on `PORT` |

## Environment

See `.env.example`. If port `3001` is already in use, set `PORT` to another value and match `VITE_WS_PROXY_TARGET` in `.env` for Vite’s `/ws` proxy.

## Security note

Room IDs are shared secrets; there is no authentication. Use only for demos.
