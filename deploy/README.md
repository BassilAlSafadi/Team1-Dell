# Deploying the backend 24/7 (cloud VM + Cloudflare quick tunnel)

Runs the services + gateway in one `docker compose` stack on a cloud VM, exposed to the
internet through a free Cloudflare quick tunnel (no domain, no Cloudflare account). The
Vercel frontend points at the tunnel URL.

- **Uptime:** 24/7, independent of your laptop.
- The per-service configs in `infra/cloudflare-tunnel/` are **not** used here — that's a
  future multi-host setup. Here the mesh stays on the internal Docker network and only the
  gateway is exposed.

Two host options below — use **A (AWS free tier)** or **B (Oracle Always Free)**.

---

## 1A. AWS EC2 free tier (`t3.micro`, 1 GB)

> ⚠️ Card is on file. **Set a $1 monthly budget alert first** (Billing → Budgets) and keep
> to free-tier limits: `t3.micro` 750 h/month + 30 GB EBS, for 12 months. Stop the instance
> when you don't need it to avoid burning the 750 hours.

1. **EC2 → Launch instance:**
   - Name `team1-dell`, AMI **Ubuntu Server 24.04 LTS (x86)**
   - Type **`t3.micro`**  ·  Key pair: create + download the `.pem`
   - Storage **30 GB gp3**
   - Security group: **SSH (22) from My IP only**. No other inbound — the tunnel is outbound.
2. Note the **public IPv4**. SSH in: `ssh -i team1-dell.pem ubuntu@<public-ip>`
3. **Add swap** (mandatory on 1 GB or the .NET builds OOM):
   ```bash
   sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
   On 1 GB, `up.sh` automatically disables `ai-service` (replaced with an idle placeholder)
   so the 3 .NET services fit. The chatbot / waste-classifier endpoints are off; everything
   else works. To run the real `ai-service`, move to a 2 GB instance (`t3.small`, ~$15/mo).

Then go to **step 2**.

## 1B. Oracle Cloud Always Free (`VM.Standard.A1.Flex` ARM, up to 4/24)

$0 ongoing; debit card at signup for identity check only. (An NBE card is often declined by
Oracle — if so, use option 1A or have a teammate sign up.)

1. Sign up at <https://www.oracle.com/cloud/free/>. Pick a **home region** with spare ARM
   capacity (avoid Frankfurt/Ashburn); you can't change it later.
2. **Compute → Instances → Create**: Ubuntu 24.04, shape `VM.Standard.A1.Flex`, **2 OCPU /
   12 GB**, assign public IPv4, upload your SSH key. Retry on "Out of host capacity".
3. No ingress rule needed (gateway isn't published). With 12 GB, `ai-service` runs normally.

Then go to **step 2**.

## 2. Bootstrap the VM

SSH in, then:

```bash
curl -fsSL https://raw.githubusercontent.com/BassilAlSafadi/Team1-Dell/main/deploy/vm-bootstrap.sh | bash
```

Log out and back in (so `docker` works without `sudo`).

## 3. Get the code + secrets onto the VM

```bash
git clone https://github.com/BassilAlSafadi/Team1-Dell.git
cd Team1-Dell
```

The `.env` files are gitignored (they hold DB passwords, JWT keys, API tokens), so copy them
from your machine — from a local terminal **in the repo root**, with your `.pem` for AWS:

```bash
SSH="-i ~/team1-dell.pem"          # AWS; leave empty for Oracle
HOST=ubuntu@<public-ip>

scp $SSH gateway/.env $HOST:~/Team1-Dell/gateway/.env
for s in auth marketplace messaging notification transaction; do \
  scp $SSH services/$s-service/.env $HOST:~/Team1-Dell/services/$s-service/.env; done
# ai-service/.env only needed on a 2 GB+ box (skipped on t3.micro):
scp $SSH services/ai-service/.env $HOST:~/Team1-Dell/services/ai-service/.env || true
```

Then on the VM, edit `gateway/.env` and add your Vercel URL to `CORS_ORIGINS`:

```
CORS_ORIGINS=https://httpsrecycle-hub-drab.vercel.app,http://localhost:5173
```

## 4. Launch

```bash
bash deploy/up.sh
```

First run builds the images (~10–20 min on t3.micro with swap). `up.sh` auto-detects the
1 GB box and disables `ai-service`. It prints the public gateway URL when the tunnel is up:

```
 PUBLIC GATEWAY URL:  https://<random-words>.trycloudflare.com
```

## 5. Point the frontend at it

In the Vercel project settings, set the API base URL env var (e.g. `VITE_API_URL` /
`NEXT_PUBLIC_API_URL` — whatever the frontend reads) to that URL, and redeploy the frontend.

## Operating it

On a **t3.micro**, add `-f docker-compose.t3micro.yml` to every command below, or set:
`alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.t3micro.yml'`

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
