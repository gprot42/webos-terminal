# Installing webOS Terminal

Step-by-step guide to get webOS Terminal running on your LG TV.

## Before you begin

You will need:

1. **A rooted LG webOS TV** — see [webosbrew.org/rooting](https://www.webosbrew.org/rooting/) or [cani.rootmy.tv](https://cani.rootmy.tv) for device-specific guides.
2. **Homebrew Channel** — usually installed automatically when you root. If not, install it from [webosbrew/webos-homebrew-channel](https://github.com/webosbrew/webos-homebrew-channel).
3. **Network access** — your TV and computer should be on the same local network (for manual install).

> **Note:** This app is aimed at rooted TVs. On a non-rooted TV, shell access is very limited and the terminal may not work as expected.

---

## Install from a computer

webOS Terminal is not in the Homebrew Channel app store yet. Install it by sideloading from a computer on the same network as your TV.

### Option 1: Install script (macOS, recommended)

If you are on macOS and have cloned this repository, the fastest path is:

```bash
./install2tvfrommacos.sh
```

The script builds the app, packages an IPK, configures SSH/ares if needed, installs to your TV, and launches the app. Set `TV_IP` if your TV is not at the default address:

```bash
TV_IP=192.168.0.50 ./install2tvfrommacos.sh
```

Prerequisites: `npm`, the Enact CLI (`enact`), and `@webosose/ares-cli` installed globally. Your TV needs Homebrew Channel with **SSH enabled** (as `root` on port 22).

### Option 2: Manual install

Use this on other platforms, or if you prefer to run each step yourself.

#### 1. Set up your computer

Install the webOS TV CLI tools:

```bash
npm install -g @webosose/ares-cli
```

#### 2. Connect your TV

**Rooted TV (recommended):**

1. In Homebrew Channel, enable **SSH**.
2. On your computer, generate an SSH key if you do not have one: `ssh-keygen`
3. Copy your public key to the TV: `~/.ssh/authorized_keys` (as user `root`)
4. Register the device:

```bash
ares-setup-device -a webos \
  -i "username=root" \
  -i "privatekey=/path/to/your/id_rsa" \
  -i "host=YOUR_TV_IP" \
  -i "port=22"
```

**Developer Mode TV (non-root):**

1. Install the Developer Mode app from the LG Content Store.
2. Enable developer mode and download the TV key from `http://YOUR_TV_IP:9991/webos_rsa`
3. Register with `ares-setup-device` using username `prisoner`, port `9922`, and the downloaded key.

#### 3. Build the app

From the repository root:

```bash
git clone <repository-url>
cd webos-terminal
npm install
npm run build
```

This produces a `dist/` folder with the app and shell service.

#### 4. Package and install

```bash
cd dist
ares-package .
ares-install org.webosbrew.terminal_0.1.0_all.ipk
```

Replace the version number in the filename if yours differs.

#### 5. Launch the app

```bash
ares-launch org.webosbrew.terminal
```

Or find **webOS Terminal** in your TV’s app launcher.

---

## Homebrew Channel app store (not yet available)

webOS Terminal is not published to the Homebrew Channel store yet. When it is, you will be able to install it from the TV without a computer. Until then, use the sideload steps above.

---

## First launch

1. Open **webOS Terminal**.
2. You should see a terminal prompt. By default this is `$` as the `prisoner` user (see **[Running as root](#running-as-root)** below for a `#` root prompt).
3. Type a simple command to confirm it works, such as:

```bash
uname -a
ls /
```

4. Use your remote to focus the terminal. The on-screen keyboard appears when you need to type.

---

## Running as root

By default the terminal runs as the `prisoner` user inside the homebrew jail (`$` prompt). To run it as **root** (`#` prompt), elevate the shell service from SSH on the same network.

### Elevate the service

SSH in as `root`, then run these commands **in order**. Let `elevate-service` finish on its own — do not interrupt it with Ctrl+C; it may pause briefly while Luna rescans services.

```bash
ssh root@YOUR_TV_IP

# 1. Patch Luna config so the terminal service runs outside the homebrew jail
/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service org.webosbrew.terminal.service

# 2. Reload service definitions and stop any stale jailed instance
/usr/sbin/ls-control scan-services
pkill -f org.webosbrew.terminal.service
```

Then launch **webOS Terminal** (close it first if it was already open).

### Confirm it worked

Inside the terminal app (not your SSH session), run:

```bash
whoami
id
```

You should see `root` and `uid=0(root)`.

To verify the elevation patch on disk:

```bash
grep '^Exec=' /var/luna-service2-dev/services.d/org.webosbrew.terminal.service.service 2>/dev/null \
  || grep '^Exec=' /var/luna-service2/services.d/org.webosbrew.terminal.service.service
```

`Exec=` should point to Homebrew Channel’s `run-js-service`, not `/usr/bin/run-js-service`.

### After reboot

Elevation persists across normal reboots. Open **Homebrew Channel once** after each boot so root services stay active, then launch webOS Terminal.

If the app is back to `prisoner`, re-run the `ls-control` and `pkill` commands above and relaunch the app.

### After reinstall or update

Installing a new IPK can reset the service launcher. Re-run the full **[Elevate the service](#elevate-the-service)** steps above.

### Auto-elevate on every boot

The one-time `elevate-service` command persists across normal reboots. If you want it re-applied automatically (e.g. after app updates), add a startup hook:

```bash
mkdir -p /var/lib/webosbrew/init.d
cat << 'EOF' > /var/lib/webosbrew/init.d/50-webos-terminal-elevate
#!/bin/sh
/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service org.webosbrew.terminal.service
/usr/sbin/ls-control scan-services
pkill -f org.webosbrew.terminal.service || true
EOF
chmod +x /var/lib/webosbrew/init.d/50-webos-terminal-elevate
```

Homebrew Channel runs scripts in `/var/lib/webosbrew/init.d` on each boot.

---

## Troubleshooting

### The app opens but shows no shell / an error message

- Confirm your TV is **rooted** and Homebrew Channel is installed.
- Make sure Homebrew Channel’s root services are running (open Homebrew Channel once after boot).
- Try reinstalling the app.

### Commands fail with “permission denied”

- The app may be running as `prisoner` without root privileges. See **[Running as root](#running-as-root)** above.
- If you already ran `elevate-service` but still see `prisoner`, reload services and kill the stale instance:
  ```bash
  /usr/sbin/ls-control scan-services
  pkill -f org.webosbrew.terminal.service
  ```
  Then relaunch webOS Terminal.
- Open Homebrew Channel once after boot so elevation and root services stay active.
- Some system paths are protected even on rooted devices.

### Yellow “Degraded mode: Homebrew Channel spawn service” banner

- The app fell back to Homebrew Channel’s spawn API instead of the native terminal service.
- Re-run the full elevation steps in **[Running as root](#running-as-root)** and confirm root status is **ok** in Homebrew Channel settings.

### I only see a browser-style preview when developing

- That is expected when running `npm run serve` on a computer. Deploy to a real TV to get a live shell.

### SSH / ares-cli cannot connect

- Check the TV IP address has not changed.
- Confirm SSH is enabled in Homebrew Channel.
- Verify your SSH key is in `/home/root/.ssh/authorized_keys` on the TV.
- Try connecting directly: `ssh root@YOUR_TV_IP`

### Reinstalling or updating

```bash
ares-install org.webosbrew.terminal_0.1.0_all.ipk
```

Installing again over an existing copy is safe. Re-run `./install2tvfrommacos.sh` or `ares-install` with the new IPK to update, then re-run the **[Elevate the service](#elevate-the-service)** steps — updates can reset the service launcher.

---

## Uninstalling

From a computer:

```bash
ares-install --remove org.webosbrew.terminal
```

---

## Need help?

- [webOS Homebrew](https://www.webosbrew.org/)
- [Homebrew Channel on GitHub](https://github.com/webosbrew/webos-homebrew-channel)
- Community forums and Discord linked from the Homebrew site