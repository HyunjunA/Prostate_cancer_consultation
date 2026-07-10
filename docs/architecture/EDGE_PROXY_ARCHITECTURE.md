# Edge & Proxy Architecture — Reverse Proxy vs Load Balancer vs API Gateway

**Audience:** engineers deploying/operating this dashboard.
**Purpose:** (1) a concise primer on the three edge components that sit between
users and servers, and (2) an honest map of where this project stands today and
what the next production step is.

---

## 1. The three components (concept primer)

All three sit between clients and your backend, so they look interchangeable.
They are not — each solves a *different* scaling/reliability problem. They form
a **spectrum of capabilities**, not three isolated categories.

### Reverse proxy
Works on behalf of the **server** (the mirror image of a *forward* proxy, which
works on behalf of the client, e.g. a VPN). Clients talk to the proxy; the proxy
forwards to the real backend, which stays hidden.

Typical responsibilities (offloaded from the app):
- **TLS/SSL termination** — the expensive crypto handshake happens once at the edge.
- **Caching** — identical responses served without waking the backend.
- **Compression** — gzip/brotli before the response leaves the edge.
- **Security** — hides the backend IP; rate limiting, header enforcement, blocking malformed/malicious requests.

General-purpose, operates at the connection/routing level. **Does not understand
business logic** (`/users` vs `/orders`, auth, permissions, API versions).
Tools: **nginx, HAProxy, Caddy, Envoy**.

### Load balancer
A reverse proxy that **specialized in one skill: intelligent traffic
distribution** across a *pool* of backend servers, while tracking which servers
are healthy.

- Strategies: **round-robin**, **least-connections**, **weighted** (bigger box gets more), **IP hashing** (session affinity).
- **L4** (TCP/IP, port — fast, blind to HTTP) vs **L7** (reads URL/headers/cookies — content-based routing). AWS **NLB** ≈ L4, **ALB** ≈ L7.
- Killer feature: **health checks** → a dead instance is dropped automatically; traffic reroutes with no human intervention → **horizontal scaling + high availability**.

### API gateway
A reverse proxy that **understands your APIs**. Solves the "every microservice
re-implements the same edge concerns" problem by centralizing them once:

- **Authentication/authorization** at the edge (validate JWT/API key once).
- **Rate limiting by tier** (free 100/min, pro 1000/min, …).
- **Request/response transformation** (JSON↔XML, strip internal fields).
- **API versioning routing** (`/v1` → old service, `/v2` → new).
- **Observability** — one central entry point → traffic/error/latency visibility.

Tools: **Kong** (built on nginx), **AWS API Gateway**, **Apigee**, **Tyk**, Envoy-based gateways.

### Why people mix them up
The tools blur the boundaries. nginx alone can be all three; Kong is an API
gateway *built on* nginx; AWS ALB (L7 routing) and API Gateway overlap. So the
useful question is **not** "what category is this tool?" but **"what capability
does my system actually need?"**

### How they layer in large production systems
```
User → CDN (globally distributed reverse proxies, TLS at edge, absorbs spikes)
     → API Gateway (edge entry: authN, rate limit, routing to services)
     → Load Balancer (per-service: distribute across healthy instances)
     → internal reverse proxy (nginx/Envoy sidecar: internal TLS, compression)
     → the service
```
The layers are **complementary, not redundant** — but **not every app needs all
of them.** Match to requirements, not to what looks impressive on a diagram.

---

## 2. Decision rule (what to actually do)

| Your problem | Use | Example tools |
|---|---|---|
| One backend; need TLS, caching, compression, basic security | **Reverse proxy** | nginx, Caddy, HAProxy |
| Multiple backends; need traffic distribution + failover | **Load balancer** | nginx upstream, HAProxy, AWS ALB/NLB |
| Public API (external devs/mobile); auth, API keys, tiered rate limits, versioning, analytics | **API gateway** | Kong, AWS API Gateway, Apigee, Tyk |
| Large microservices; consistent policy across many services | **API gateway** (+ service mesh) | Envoy-based, Istio/Linkerd |

---

## 3. Where THIS project stands today (honest map)

What already exists that *resembles* a proxy:

| Component | Present? | What it is |
|---|---|---|
| Next.js webapp same-origin proxy (`src/app/api/backend/[...path]/route.ts` → `BACKEND_URL`) | ✅ | **Application-level** proxy — part of the app, forwards browser calls to the backend. |
| NLP gateway (`:18080`, in front of the R classifier `:8888`) | ✅ | A **gateway** in front of the NLP classifier — internal only, does authN when enabled. |
| **Edge reverse proxy (nginx/Caddy) with TLS** | ❌ **absent** | The layer the primer above is about. |

Current reality: the dashboard is served over **plain HTTP** — e.g.
`http://<host>:3001` — with **no TLS termination** and **no 443 listener**. The
Next.js server is hit directly. There is no nginx/Caddy/HAProxy process.

**Verdict:** the app has an internal application proxy, but the
*infrastructure* reverse proxy the industry means (TLS + security edge) is **not
yet deployed.**

---

## 4. Recommended next step for this project

This system is a single dashboard + a few internal services. Per the decision
rule, it needs a **reverse proxy for TLS termination** — **not** a load balancer
or API gateway yet.

Concretely: put **nginx (or Caddy)** in front of the webapp so that:
- users connect over **HTTPS** (mandatory for PHI — see
  `docs/setup/DEPLOYMENT_3PHASE_SERVER_AWS_UBUNTU.txt` §10c),
- port `3001` is **no longer exposed directly**; only the proxy's `443` faces
  the network, forwarding internally to `127.0.0.1:3001`.

Options for the TLS certificate:
1. **Domain name available** → nginx + certbot (Let's Encrypt). Recommended.
2. **No domain** → Caddy self-signed / IP cert (browser warning).
3. **AWS-native** → Application Load Balancer + ACM certificate (offload TLS to AWS).

Load balancer / API gateway become relevant **later**, only when there are
multiple backend instances (→ load balancer) or a public multi-tenant API with
tiers and versioning (→ API gateway).

---

## See also
- `docs/architecture/ARCHITECTURE.md` — overall system architecture.
- `docs/setup/DEPLOYMENT_3PHASE_SERVER_AWS_UBUNTU.txt` — deployment runbook; §7 (access methods), §10c (TLS), §10 (production hardening).
