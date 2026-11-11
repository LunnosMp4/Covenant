# Self-hosting SearXNG on a Raspberry Pi for Covenant

This guide sets up a private SearXNG instance on a Raspberry Pi and points Covenant's
optional web search at it. Covenant uses OpenAI web search by default; SearXNG is an optional
alternative with no per-search cost.

---

## 1. What you need

- Raspberry Pi 4 or 5 with **2 GB+ RAM** (Pi 3 works, but searches are slower)
- 64-bit Raspberry Pi OS (recommended) or a 32-bit install (the image supports both)
- Docker + Docker Compose
- A wired or stable Wi-Fi connection
- A static IP or a DHCP reservation for the Pi

The official `searxng/searxng` image supports `linux/arm64` and 32-bit `linux/arm`.

### Find the Pi's IP

```bash
hostname -I
```

Example: `192.168.1.50`. Use this IP everywhere below. Do **not** rely on
`raspberrypi.local` from Windows; mDNS is not always available. Use a DHCP reservation in your
router or a static IP.

---

## 2. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
```

Log out and back in (or reboot) so the group change applies. Verify:

```bash
docker --version
docker compose version
```

If `docker compose` is missing, install the plugin:

```bash
sudo apt update
sudo apt install -y docker-compose-plugin
```

---

## 3. Create the SearXNG directory

```bash
mkdir -p ~/searxng/core-config
mkdir -p ~/searxng/valkey-data
cd ~/searxng
```

Create `docker-compose.yml`:

```yaml
services:
  searxng:
    image: searxng/searxng:latest
    container_name: searxng
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./core-config:/etc/searxng:rw
    environment:
      - SEARXNG_BASE_URL=http://192.168.1.50:8080/
      - SEARXNG_SECRET=replace-with-a-long-random-string

  valkey:
    image: valkey/valkey:8-alpine
    container_name: searxng-valkey
    restart: unless-stopped
    command: valkey-server --save 30 1 --loglevel warning
    volumes:
      - ./valkey-data:/data
```

Replace `192.168.1.50` with your Pi's IP and generate a real secret:

```bash
openssl rand -hex 32
```

Put that value in `SEARXNG_SECRET`.

> Valkey is optional when the limiter is off. It is included here so you can enable caching or
> the limiter later without changing the stack.

---

## 4. Create `core-config/settings.yml`

Create `~/searxng/core-config/settings.yml`:

```yaml
use_default_settings: true

server:
  base_url: http://192.168.1.50:8080/
  secret_key: "replace-with-the-same-long-random-string"
  limiter: false
  public_instance: false

search:
  formats:
    - html
    - json
```

Key points:

- `use_default_settings: true` keeps SearXNG's built-in engine list and only overrides the
  values below.
- **`search.formats` must include `json`.** JSON is disabled by default; without it Covenant
  receives HTTP 403.
- `limiter: false` is appropriate for a LAN-only personal instance. If you enable it later,
  make sure Valkey is configured and the limiter is tuned for your client.
- `public_instance: false` is correct for a private instance.
- `base_url` must match the URL you will enter in Covenant.

If you change the port in `docker-compose.yml` (for example `8081:8080`), update `base_url`
and the Covenant endpoint too.

---

## 5. Start SearXNG

```bash
cd ~/searxng
docker compose up -d
docker compose ps
```

Both `searxng` and `searxng-valkey` should be `Up`.

Watch the logs:

```bash
docker compose logs -f searxng
```

Press `Ctrl+C` to stop watching logs; the container keeps running.

---

## 6. Verify the JSON endpoint

From your PC (not the Pi):

```bash
curl "http://192.168.1.50:8080/search?q=test&format=json"
```

You should get a JSON object containing `results`.

If you have `jq`:

```bash
curl -s "http://192.168.1.50:8080/search?q=test&format=json" | jq '.results[0]'
```

### Common failures

| Result | Meaning | Fix |
| --- | --- | --- |
| `403` | JSON is disabled or the limiter is blocking | Add `json` to `search.formats`; set `limiter: false`; restart |
| `401` | A reverse proxy is asking for auth | Configure auth in Covenant, or remove proxy auth for LAN |
| Connection refused | Container not running or wrong port | `docker compose ps`; check the port mapping |
| Timeout | Firewall or wrong IP | Check the Pi firewall and that both devices are on the same network |
| HTML page instead of JSON | JSON not enabled | Fix `settings.yml` and restart |

Restart after any settings change:

```bash
docker compose restart searxng
```

---

## 7. Allow the Pi through its firewall (if enabled)

If `ufw` is active, allow the LAN subnet only:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 8080 proto tcp
sudo ufw status
```

Adjust the subnet to match your network. Do **not** open the port to the whole internet.

---

## 8. Configure Covenant

1. Open **Settings → AI Provider**.
2. Under **Web search**, set **Provider** to **SearXNG (custom endpoint)**.
3. Set **SearXNG endpoint** to:

   ```text
   http://192.168.1.50:8080
   ```

4. Leave **Authentication** as **None** for a LAN-only instance.
5. Leave **Allow self-signed certificate** off unless you set up HTTPS with a self-signed
   certificate.
6. Keep **Bypass proxy for local addresses** on if you use a global proxy.
7. Click **Test search**. You should see a message with the number of results.
8. Enable the **Web search** toggle.

OpenAI remains the default provider. Switching to SearXNG is optional.

---

## 9. Optional: remote access with Tailscale

If you want to use the Pi outside your LAN, do **not** port-forward SearXNG directly. Use a
VPN such as Tailscale:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Then use the Pi's Tailscale IP or MagicDNS name in Covenant. If you use Tailscale HTTPS, enter
the `https://...` URL and leave the self-signed option off.

---

## 10. Optional: reverse proxy with auth and HTTPS

If you expose SearXNG through a reverse proxy, add authentication. Example Caddy setup:

1. Install Caddy.
2. Generate a password hash:

   ```bash
   caddy hash-password --plaintext 'your-password'
   ```

3. Create `/etc/caddy/Caddyfile`:

   ```caddyfile
   search.example.com {
     basic_auth {
       covenant <paste-the-hash-here>
     }
     reverse_proxy 127.0.0.1:8080
   }
   ```

4. Reload Caddy:

   ```bash
   sudo systemctl reload caddy
   ```

5. In Covenant:
   - Endpoint: `https://search.example.com`
   - Authentication: **Basic auth**
   - Username: `covenant`
   - Password: the plaintext password
   - Allow self-signed certificate: off if Caddy has a trusted certificate

Covenant sends the Basic auth header from the main process; credentials are stored encrypted
on your device.

---

## 11. Updating SearXNG

```bash
cd ~/searxng
docker compose pull
docker compose up -d
```

Your `core-config/settings.yml` and `valkey-data` are preserved.

---

## 12. Backup and restore

Back up the configuration and cache:

```bash
tar -czf searxng-backup-$(date +%F).tar.gz core-config valkey-data
```

Restore by extracting the archive into `~/searxng` and running `docker compose up -d`.

---

## 13. Performance notes

- Pi 4/5 handles personal use comfortably. Pi 3 works but may take several seconds per query.
- SearXNG queries multiple upstream engines. If one is slow or blocked, disable it in
  `settings.yml` under `engines:`.
- Upstream engines may rate-limit or CAPTCHA the Pi's public IP. Check logs:

  ```bash
  docker compose logs -f searxng
  ```

- Increase Covenant's search timeout (Settings → AI Provider → Web search → Timeout) if your
  Pi is slow. The default is 15 seconds.
- Keep `limiter: false` for a LAN-only instance unless you deliberately configure Valkey and
  the limiter.

---

## 14. Security checklist

- Keep SearXNG on your LAN, or reach it through Tailscale/WireGuard.
- Do not port-forward SearXNG directly to the internet.
- If you must expose it, put it behind HTTPS and authentication.
- Change `secret_key` from the example value.
- Keep the Docker image updated.
- Leave `public_instance: false`.
- Use a firewall rule limited to your LAN subnet.

---

## 15. Uninstall

```bash
cd ~/searxng
docker compose down
cd ~
rm -rf ~/searxng
```

Remove the firewall rule if you added one:

```bash
sudo ufw delete allow from 192.168.1.0/24 to any port 8080 proto tcp
```

---

## 16. Quick checklist

- [ ] Docker and Compose installed
- [ ] Pi has a static IP / DHCP reservation
- [ ] `docker-compose.yml` uses the correct port and `SEARXNG_BASE_URL`
- [ ] `settings.yml` has `use_default_settings: true`
- [ ] `search.formats` includes `json`
- [ ] `limiter: false` for LAN use
- [ ] `public_instance: false`
- [ ] `secret_key` changed
- [ ] `docker compose up -d` is healthy
- [ ] `curl "http://<pi-ip>:8080/search?q=test&format=json"` returns JSON
- [ ] Covenant Web search provider is set to SearXNG
- [ ] Covenant **Test search** succeeds
- [ ] LAN-only or VPN/reverse proxy with auth
