# Network Exposure — Serving the Dashboard on the LAN

> **Scope:** this is an **add-on** to [`DEPLOYMENT_NATIVE.md`](./DEPLOYMENT_NATIVE.md).
> The native deployment binds the webapp to `127.0.0.1:3001`
> (localhost-only) — reachable only from a browser **on the deployment
> host itself**. This guide exposes the dashboard on the host's network
> interface so other machines on the same LAN can open it at
> `http://<HOST_IP>:3001`.
>
> The base guide intentionally does **not** cover this — it assumes a
> single-host, localhost-only setup. Do this only when you actually need
> off-host access, and read [Security considerations](#security-considerations) first.

In the example commands below, `<HOST_IP>` is the deployment host's LAN
address (e.g. `10.226.8.205` — find yours with `hostname -I`).

---

## What changes — and what does not

| Component             | Before (base guide)                      | After (this guide)                                         |
| --------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Webapp container port | `127.0.0.1:3001 → 3000` (localhost-only) | `0.0.0.0:3001 → 3000` (all interfaces)                     |
| Backend (uvicorn)     | already `0.0.0.0:18010`                  | unchanged — already network-bound                          |
| Webapp image          | —                                        | **no rebuild** (see [below](#why-no-rebuild-is-needed))    |
| Backend `.env` / CORS | —                                        | **no change** (see [CORS](#cors--why-no-change-is-needed)) |

Only **one line** of `docker-compose-frontend.yml` changes; everything
else is a container recreate + verification.

> **Port note for this host:** the backend runs on **`18010`**, not the
> guide's default `18000` — `:18000` was already held by another user's
> service. The webapp reaches it via `BACKEND_URL=http://host.docker.internal:18010`
> (server-side proxy, set in `docker-compose-frontend.yml`). None of that
> changes here.

---

## Prerequisites

- Phase 1 already up per `DEPLOYMENT_NATIVE.md` (webapp container running,
  backend healthy on `:18010`).
- Docker usable without sudo on the host.
- You know the host's LAN IP (`hostname -I`).

---

## Steps

### 1. Change the webapp port binding to all interfaces

Edit `docker-compose-frontend.yml`:

```yaml
    ports:
-     - "127.0.0.1:3001:3000"        # localhost-only
+     - "0.0.0.0:3001:3000"          # exposed on every interface
```

One-liner equivalent:

```bash
sed -i 's#- "127.0.0.1:3001:3000"#- "0.0.0.0:3001:3000"#' docker-compose-frontend.yml
```

### 2. Recreate the webapp container

The change is a port re-publish, so the container must be recreated
(a restart is not enough). Source the backend `.env` first so any
`${API_KEY}`-style interpolation is populated:

```bash
set -a; source app/Backend/.env; set +a
docker compose -f docker-compose-frontend.yml up -d --pull never
```

### 3. Verify

```bash
# binding is now 0.0.0.0, not 127.0.0.1
ss -ltn | grep ':3001'
#   LISTEN 0 4096 0.0.0.0:3001 0.0.0.0:*

# reachable via the host IP, not just localhost
curl -s -o /dev/null -w "%{http_code}\n" http://<HOST_IP>:3001/        # 200

# end-to-end: webapp proxies to the backend and returns real data
curl -s http://<HOST_IP>:3001/api/backend/patient/files                 # {"files":[...]}
```

`docker port prostatecancer-webapp-native` should show
`3000/tcp -> 0.0.0.0:3001`.

From any machine on the same network, the dashboard is now at:

```
http://<HOST_IP>:3001
```

---

## Why no rebuild is needed

The webapp never hardcodes the host. The browser talks only to the
**Next.js server-side proxy** at `app/Webapp/src/app/api/backend/[...path]/route.ts`,
using **relative** paths:

```ts
fetch(`/api/backend/patient/files`); // relative → current origin
new URL(`${API_BASE}/api/backend/...`, window.location.origin); // origin-relative
```

Because every backend call is relative to `window.location.origin`, it
resolves correctly whether the page was opened at `localhost:3001` or
`<HOST_IP>:3001`. `NEXT_PUBLIC_API_URL` is **not referenced** in the
source, so no build-time value is baked in — recreating the container is
enough.

---

## CORS — why no change is needed

`app/Backend/.env`'s `CORS_ORIGINS` lists only `localhost:3001`,
`127.0.0.1:3001`, and `host.docker.internal:3001`, yet off-host access
still works. That is by design: the browser only ever calls the **Next.js
server** (same origin as the page). The Next server then proxies to the
backend **server-to-server** via `BACKEND_URL`. The browser never makes a
cross-origin request to the backend, so the backend's CORS allow-list is
never consulted on this path — no entry for `<HOST_IP>:3001` is required.

> If you later add code that calls the backend **directly from the
> browser** (bypassing the proxy), add `http://<HOST_IP>:3001` to
> `CORS_ORIGINS` and restart the backend.

---

## Firewall

Binding to `0.0.0.0` makes the container listener accept connections on
every interface, but a **host firewall** can still block port 3001 from
outside. If the host itself reaches `http://<HOST_IP>:3001` but another
machine cannot, open the port (needs sudo):

```bash
sudo ufw allow 3001/tcp                 # ufw
# or
sudo iptables -A INPUT -p tcp --dport 3001 -j ACCEPT
```

---

## Security considerations

Exposing on `0.0.0.0` puts the dashboard in front of **everyone on the
LAN**. The dashboard serves clinical-adjacent data, so before exposing:

- Prefer an **SSH tunnel** over raw exposure when only you need access:
  `ssh -L 3001:localhost:3001 <user>@<HOST_IP>`, then browse
  `http://localhost:3001`. This needs **no** compose change at all.
- If you must expose to the LAN, restrict by firewall to known client
  IPs, and consider fronting it with nginx + TLS + auth rather than the
  raw container port.
- Never expose the **NLP gateway** (`:18080`) or the raw backend
  (`:18010`) more widely than necessary — the gateway carries an
  `X-API-Key`; the backend has its own `API_KEY`.

> Do not confuse services: `http://<HOST_IP>:3001` is the **dashboard**.
> `http://<HOST_IP>:18080` is the **NLP classifier gateway** (a JSON API
> used by the pipeline, not a browser UI).

---

## Revert to localhost-only

```bash
sed -i 's#- "0.0.0.0:3001:3000"#- "127.0.0.1:3001:3000"#' docker-compose-frontend.yml
set -a; source app/Backend/.env; set +a
docker compose -f docker-compose-frontend.yml up -d --pull never
ss -ltn | grep ':3001'      # back to 127.0.0.1:3001
```

---

## Architecture recap (with exposure)

```
[other LAN machine]  --http://<HOST_IP>:3001-->  webapp (Docker, 0.0.0.0:3001->3000)
                                                    │  server-side proxy
                                                    └─ host.docker.internal:18010 ─→ Backend (native, 0.0.0.0:18010)
                                                                                        └─ localhost:5439 ─→ Postgres (native)
```

The webapp is the only browser-facing surface; the backend and database
stay reachable only through the proxy and the host, respectively.
