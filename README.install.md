# Installing webOS Terminal

Step-by-step guide to get webOS Terminal running on your LG TV.

## Before you begin

You will need:

1. **A rooted LG webOS TV** — see [webosbrew.org/rooting](https://www.webosbrew.org/rooting/) or [cani.rootmy.tv](https://cani.rootmy.tv) for device-specific guides.
2. **Homebrew Channel** — usually installed automatically when you root. If not, install it from [webosbrew/webos-homebrew-channel](https://github.com/webosbrew/webos-homebrew-channel).
3. **Network access** — your TV and computer should be on the same local network (for manual install).

> **Note:** This app is aimed at rooted TVs. On a non-rooted TV, shell access is very limited and the terminal may not work as expected.

### webOS version notes

| webOS | What you get |
|---|---|
| **4.x and newer** | Full app (React / xterm) |
| **3.x** | Experimental full-app boot (Chromium 38) |
| **1.x–2.x** | **Cut-down legacy shell** only — vanilla UI, single session, basic ANSI. Same IPK; the app auto-selects this path on WebKit. Not feature-parity with modern TVs. |

If a webOS 2 TV previously showed a **blank screen**, reinstall a build that includes the dual-boot loader (`legacy-webos2.js`). You should see a yellow **Legacy** badge and an explanatory banner.

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
ares-install com.github.gprot42.webosterminal_0.1.0_all.ipk
```

Replace the version number in the filename if yours differs.

#### 5. Launch the app

```bash
ares-launch com.github.gprot42.webosterminal
```

Or find **webOS Terminal** in your TV’s app launcher.

---

## Homebrew Channel app store

webOS Terminal is available in the [webOS Homebrew app repository](https://repo.webosbrew.org/). On a rooted TV with Homebrew Channel installed, open the store, search for **webOS Terminal**, and install it directly — no computer required.

If the store listing is not yet visible on your TV, refresh the app catalog in Homebrew Channel settings, or use the sideload steps above.

---

## First launch

1. Open **webOS Terminal**.
2. You should see a terminal prompt. By default this is a **real shell as `prisoner` (non-root)** — `$` prompt, enough for normal Linux commands. See **[Running as root](#running-as-root)** only if you need `#` / PTY.
3. Type a simple command to confirm it works, such as:

```bash
whoami
uname -a
ls /
```

`whoami` should print `prisoner` (or `root` if you already elevated).

4. Use your remote to focus the terminal. The on-screen keyboard appears when you need to type.

---

## Non-root vs root

| Mode | Status line | `whoami` | What you get |
|---|---|---|---|
| **Default (non-root)** | `mode=native · prisoner` | `prisoner` | Real Linux commands in the homebrew jail |
| **Elevated (root)** | `mode=native · root` (+ optional PTY) | `root` | Full filesystem, `/dev/ptmx`, job control, TUIs |

**You do not need root** to use the terminal for ordinary commands (`ls`, `cat`, pipelines, etc.). Elevate only when you need root privileges or a real PTY (`vim`, `htop`, …).

There is **no mock mode**. If the service cannot start you get an error, not a fake shell.

## Running as root

Optional. By default the terminal runs as the `prisoner` user inside the homebrew jail (`$` prompt). To run as **root** (`#` prompt), elevate the shell service from SSH:

### Elevate the service (SSH)

### Why run as root?

The homebrew jail the `prisoner` user runs in blocks more than just a handful of file paths — it also denies access to `/dev/ptmx`, the device Linux uses to allocate a **pseudo-terminal (PTY)**. Without a PTY, the shell has no real TTY attached, which means:

- No job control (`Ctrl+Z`, `bg`/`fg`, backgrounding jobs)
- No line editing or tab completion inside the shell itself (the app emulates basic history/backspace client-side instead)
- Full-screen terminal apps that need raw-mode input — `vim`, `htop`, `less`, `man`, `tmux` — either fail to start or render garbled

Elevating the service moves it **outside** the jail, which removes most filesystem restrictions and gives it access to `/dev/ptmx` — the prerequisite for a working PTY.

### How PTY allocation actually works

The service tries three mechanisms, in order, and automatically falls back if one doesn't work:

1. **`ptybridge`** (preferred) — a small native helper we ship at `native/ptybridge/ptybridge.c` / `services/bin/ptybridge-*`. It calls `posix_openpt`/`grantpt`/`unlockpt`, forks, and has the child call `setsid()` + `ioctl(TIOCSCTTY)` to explicitly acquire its own controlling terminal — rather than relying on inheriting one from `script` or the service process, which is what caused PTY allocation to hang on every TV we tested previously. This is what actually unlocks job control and full-screen TUIs.
2. **`script -q -c "/bin/sh -i" /dev/null`** — a generic PTY wrapper, tried if `ptybridge` is missing or fails.
3. **Piped shell** (no PTY) — `/bin/sh -i` with plain pipes, the final fallback. Works for ordinary commands but no job control or full-screen apps; the app emulates basic line history client-side to compensate.

When a PTY is available (`ptybridge` or `script`), the UI switches to **raw input passthrough**: keystrokes, arrows, Tab, and Ctrl sequences go straight to the shell. The shell then provides its own readline history, tab completion, and echo. When only the piped fallback is available, the client keeps line-buffering and local up/down history instead.

`ptybridge` is compiled statically (no runtime library dependencies) for three CPU architectures, and the service auto-selects the right one for your TV at runtime:

| Architecture | Binary | Covers |
|---|---|---|
| ARMv7 (hard-float) | `services/bin/ptybridge-armv7` | Most LG webOS TVs |
| ARM64 | `services/bin/ptybridge-aarch64` | Newer TVs/SoCs |
| x86_64 | `services/bin/ptybridge-x86_64` | webOS OSE emulator, x86-based firmware |

All three require the service to run as **root** — `ptybridge` still needs `/dev/ptmx`, which the `prisoner` jail blocks regardless of which mechanism is used.

**Bottom line:** run as root to get a real PTY via `ptybridge` — job control, shell history/completion, and full-screen apps (`vim`, `htop`, `tmux`) work once elevated, on any of the three supported architectures. If `ptybridge` ever fails on a specific TV's kernel/firmware, the app transparently falls back to `script`, then to the piped shell, so basic command-line use keeps working either way.

### Elevate the service

SSH in as `root`, then run these commands **in order**. Let `elevate-service` finish on its own — do not interrupt it with Ctrl+C; it may pause briefly while Luna rescans services.

```bash
ssh root@YOUR_TV_IP

# 1. Patch Luna config so the terminal service runs outside the homebrew jail
/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service com.github.gprot42.webosterminal.service

# 2. Reload service definitions and stop any stale jailed instance
/usr/sbin/ls-control scan-services
pkill -f com.github.gprot42.webosterminal.service
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
# webOS 3+ (luna-service2)
grep '^Exec=' /var/luna-service2-dev/services.d/com.github.gprot42.webosterminal.service.service 2>/dev/null \
  || grep '^Exec=' /var/luna-service2/services.d/com.github.gprot42.webosterminal.service.service

# webOS 1–2 (legacy ls2-dev paths used by elevate-service)
grep '^Exec=' /var/palm/ls2-dev/services/pub/com.github.gprot42.webosterminal.service.service 2>/dev/null \
  || grep '^Exec=' /var/palm/ls2-dev/services/prv/com.github.gprot42.webosterminal.service.service
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
/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service com.github.gprot42.webosterminal.service
/usr/sbin/ls-control scan-services
pkill -f com.github.gprot42.webosterminal.service || true
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

### Status shows `mode=error · service unavailable`

The client could not open a real shell (native service or Homebrew spawn). There is no offline fake shell.

Checklist:

1. **Fully close** webOS Terminal, open **Homebrew Channel once**, reopen Terminal.
2. From SSH, probe the service:
   ```bash
   luna-send -n 1 -f luna://com.github.gprot42.webosterminal.service/listSessions '{"password":"webos"}'
   # or:
   luna-send-pub -n 1 -f luna://com.github.gprot42.webosterminal.service/listSessions '{"password":"webos"}'
   ```
   Expect `"returnValue": true`. If unknown/timeout: reinstall IPK + `ls-control scan-services`.
3. Confirm service files:
   ```bash
   ls -la /media/developer/apps/usr/palm/services/com.github.gprot42.webosterminal.service/
   cat /var/palm/ls2-dev/services/pub/com.github.gprot42.webosterminal.service.service
   ```

### Commands fail with “permission denied”

- Default is `prisoner` — some paths are blocked by the jail. Elevate for root if you need them: **[Running as root](#running-as-root)**.
- Confirm the status line is **`mode=native`** (real shell), not `error`.
- If you already ran `elevate-service` but still see `prisoner`, reload services and kill the stale instance:
  ```bash
  /usr/sbin/ls-control scan-services
  pkill -f com.github.gprot42.webosterminal.service
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
ares-install com.github.gprot42.webosterminal_0.1.0_all.ipk
```

Installing again over an existing copy is safe. Re-run `./install2tvfrommacos.sh` or `ares-install` with the new IPK to update, then re-run the **[Elevate the service](#elevate-the-service)** steps — updates can reset the service launcher.

---

## Uninstalling

From a computer:

```bash
ares-install --remove com.github.gprot42.webosterminal
```

If you previously installed the app under the old package ID (`org.webosbrew.terminal`), remove that copy too:

```bash
ares-install --remove org.webosbrew.terminal
```

---

## Need help?

- [webOS Homebrew](https://www.webosbrew.org/)
- [Homebrew Channel on GitHub](https://github.com/webosbrew/webos-homebrew-channel)
- Community forums and Discord linked from the Homebrew site