# Deploying the backend 24/7 for free (Oracle Cloud Always Free + Cloudflare quick tunnel)

Runs all 6 services + the gateway in one `docker compose` stack on a free Oracle ARM VM,
exposed to the internet through a free Cloudflare quick tunnel (no domain, no Cloudflare
account). The Vercel frontend points at the tunnel URL.

- **Cost:** $0 ongoing. Oracle needs a debit card at signup for identity verification only
  (a ~$1 hold that is refunded); Always Free resources are never charged.
- **Uptime:** 24/7, independent of your laptop.
- The per-service configs in `infra/cloudflare-tunnel/` are **not** used here — that's a
  future multi-host setup. Here the mesh stays on the internal Docker network and only the
  gateway is exposed.

---

## 1. Create the Oracle VM (you do this in the Oracle console)

1. Sign up at <https://www.oracle.com/cloud/free/>. Choose your **home region** carefully —
   Always Free ARM capacity is often exhausted in busy regions (Frankfurt, Ashburn). Pick a
   smaller one near you if signup offers a choice; you cannot change it later.
2. Console -> **Compute -> Instances -> Create instance**:
   - **Image:** Canonical Ubuntu 24.04
   - **Shape:** `VM.Standard.A1.Flex` (Ampere ARM). Set **2 OCPU / 12 GB** (half the free
     allowance — enough; you can go 4/24 if capacity allows).
   - **Networking:** keep "Assign public IPv4 address".
   - **SSH keys:** upload your public key (or let it generate one and download it).
   - If you get **"Out of host capacity"**, retry later / another AD, or use a different
     home region. This is the main friction point.
3. When it's running, note the **public IP**.
4. **VCN -> Security List -> default -> Add Ingress Rule** is *not* needed — the gateway is
   never published; only the tunnel's outbound connection matters. (Add 80/443 ingress only
   if you later switch to a named tunnel with your own domain.)

## 2. Bootstrap the VM

SSH in (`ssh ubuntu@<public-ip>`), then:

```bash
curl -fsSL https://raw.githubusercontent.com/BassilAlSafadi/Team1-Dell/main/deploy/vm-bootstrap.sh | bash
```

Log out and back in (so `docker` works without `sudo`).

## 3. Get the code + secrets onto the VM

```bash
git clone https://github.com/BassilAlSafadi/Team1-Dell.git
cd Team1-Dell
```

The 7 `.env` files are gitignored (they hold DB passwords, JWT keys, API tokens), so copy
them from your machine — from a local terminal in the repo root:

```bash
scp gateway/.env ubuntu@<public-ip>:~/Team1-Dell/gateway/.env
for s in ai auth marketplace messaging notification transaction; do \
  scp services/$s-service/.env ubuntu@<public-ip>:~/Team1-Dell/services/$s-service/.env; done
```

Then on the VM, edit `gateway/.env` and add your Vercel URL to `CORS_ORIGINS`:

```
CORS_ORIGINS=https://httpsrecycle-hub-drab.vercel.app,http://localhost:5173
```

## 4. Launch

```bash
bash deploy/up.sh
```

First run builds all images (~10 min on 2 ARM cores). It prints the public gateway URL when
the tunnel is up:

```
 PUBLIC GATEWAY URL:  https://<random-words>.trycloudflare.com
```

## 5. Point the frontend at it

In the Vercel project settings, set the API base URL env var (e.g. `VITE_API_URL` /
`NEXT_PUBLIC_API_URL` — whatever the frontend reads) to that URL, and redeploy the frontend.

## Operating it

| Task | Command (from repo root on the VM) |
|---|---|
| Status | `docker compose -f docker-compose.yml -f docker-compose.prod.yml ps` |
| Logs for one service | `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f auth-service` |
| Current tunnel URL | `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs cloudflared \| grep trycloudflare` |
| Redeploy after `git pull` / `.env` change | `bash deploy/up.sh` |
| Stop everything | `docker compose -f docker-compose.yml -f docker-compose.prod.yml down` |

### The tunnel URL changes on restart

A quick tunnel gets a new random `*.trycloudflare.com` hostname every time the `cloudflared`
container restarts. It's stable while the container runs (which is `restart: unless-stopped`,
so effectively always). When it does change you must update the Vercel env var again.

To get a **permanent** hostname, register a domain (a free GitHub Student Pack `.me`, or
`eu.org`), add it to Cloudflare, and switch `docker-compose.prod.yml`'s `cloudflared`
command to a named tunnel with a token:

```yaml
    command: tunnel run --token ${CLOUDFLARE_TUNNEL_TOKEN}
```

(create the tunnel + token in the Cloudflare Zero Trust dashboard, point a DNS route at it).
