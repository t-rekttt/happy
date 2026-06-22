# Phase 01 — LiveKit Infra (self-hosted)

## Overview
- Priority: P0 (foundation)
- Status: TODO
- Stand up a self-hosted LiveKit media server the app and agent worker connect to.

## Why
The app already ships `@livekit/react-native` + `@livekit/react-native-webrtc`. We reuse
that native audio/WebRTC layer instead of building a transport. The only missing piece is a
LiveKit server we control.

## Topology (decided)
LiveKit runs **separate from happy-server** (own K8s cluster or VM/LXC). This is correct:
happy-server is NOT in the media path — it only signs a LiveKit JWT offline with
`LIVEKIT_API_SECRET` and later receives the agent's `sendMessage` over the existing socket.
Media path is phone <-> LiveKit <-> agent worker only.

- **Colocate the agent worker (phase 03) with LiveKit** (same cluster/VPC/region) — its
  hot hops are agent<->LiveKit (media) and agent<->LLM/STT/TTS. happy-server location is
  irrelevant to voice latency.
- happy-server <-> LiveKit coupling = shared API key/secret only; no network adjacency.
- App/server code is identical regardless of host — only `LIVEKIT_URL` changes. So this
  choice does not block phases 02-05.

### VM/LXC vs Kubernetes
WebRTC media is UDP and cannot traverse a normal HTTP ingress.
- **VM/LXC + host networking** (recommended for single self-host): open a UDP port range
  (e.g. 50000-60000), public IP, TLS for signaling (wss) via reverse proxy. Simplest.
- **Kubernetes** (only if cluster already exists): use the official LiveKit Helm chart with
  `hostNetwork` or a UDP `LoadBalancer` for the media range, TLS ingress for wss signaling,
  and **coturn on 443/TLS** as fallback for restrictive mobile networks.

## Requirements
- LiveKit server reachable over WSS from mobile (TLS; phones reject plain ws on prod).
- TURN/ICE works through NAT (LiveKit embedded TURN or coturn).
- API key/secret pair for server-side token minting and agent auth.

## Steps
1. Add `deploy/voice/docker-compose.yml` with `livekit/livekit-server` + optional `coturn`.
2. Generate `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`; expose `LIVEKIT_URL` (wss://...).
3. Configure `livekit.yaml`: keys, port mapping, TURN, region. Bind behind existing reverse
   proxy (Caddy) on the self-hosted box; terminate TLS there.
4. Smoke test with `lk` CLI (publish/subscribe a test track).

## Related files (created)
- `deploy/voice/livekit.yaml` — non-secret server config (keys via env)
- `deploy/voice/docker-compose.yml` — VM/LXC path, host networking + embedded TURN
- `deploy/voice/livekit-helm-values.yaml` — Kubernetes path (official chart)
- `deploy/voice/.env.example` — LIVEKIT_KEYS / URL / API_KEY / API_SECRET / TURN_DOMAIN
- `deploy/voice/.gitignore` — excludes `.env` and `certs/`

## Status
Deploy assets authored and `docker compose config` validates. Remaining (user-side, on the
target box): generate real keys, provision TURN TLS cert, deploy, and run the `lk` smoke test.

## Success criteria
- `lk room join` connects from another host; audio track round-trips.

## Risks
- Mobile NAT traversal: ensure TURN reachable on public IP/443. Mitigation: coturn on 443/tls.

## Next
- Phase 02 (token route) and Phase 03 (agent) both consume LIVEKIT_URL/KEY/SECRET.
