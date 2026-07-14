<p align="center">
  <img src="webos-meta/icon-large.png" alt="webOS Terminal" width="128">
</p>

# webOS Terminal

A native terminal app for LG webOS TVs. Open a shell right on your TV — no laptop required.

> **Root required.** This app only works on a **rooted** LG webOS TV with **Homebrew Channel** installed. Stock (non-rooted) TVs are not supported — LG blocks the shell access the app needs.

<p align="center">
  <img src="docs/images/screengrab1.jpg" alt="webOS Terminal running on TV with on-screen keyboard" width="800">
</p>

## What is this?

webOS Terminal brings a familiar command-line experience to your TV. Launch it from the app launcher, type commands, and interact with the Linux shell underneath webOS — all from the couch, using your remote.

It is built for people who have already rooted their TV and want quick on-device shell access for tinkering, debugging, or running simple commands — without SSH from another machine.

## Why use it?

Most ways to reach a webOS shell today need a second device:

- SSH from a PC
- dev-manager-desktop on a computer
- Old, unmaintained terminal apps

webOS Terminal runs **on the TV itself**. That makes it handy when you do not have a computer nearby, or when you just want a fast way to check something on the device.

It does not replace SSH — it complements it. Use SSH when you need a full desktop workflow; use webOS Terminal when you want shell access on the TV.

## What can you do?

In this early release you can:

- Run common shell commands interactively
- Use the app with your TV remote and on-screen keyboard
- Work on a TV-sized terminal with readable text and scrolling
- Open multiple tabs, each with its own shell session
- With a real PTY (service elevated as root): shell line editing, history, tab completion, job control, and full-screen apps such as `vim`, `htop`, `less`, and `tmux`

Planned for later:

- File browsing
- Log viewing

## Requirements

**You must have a rooted TV.** Without root, the terminal cannot access a real shell and the app will not work.

- **Rooted LG webOS TV** — see [webosbrew.org/rooting](https://www.webosbrew.org/rooting/) or [cani.rootmy.tv](https://cani.rootmy.tv)
- **Homebrew Channel** — installed as part of rooting; needed for SSH during install and for shell services at runtime
- **webOS 4.x or newer** for first-class support (Chromium 53+). **webOS 3.x** is an experimental modern-app target (Chromium 38). **webOS 1.x–2.x** get a **cut-down legacy shell** (WebKit), not the full UI — see [webOS version support](#webos-version-support).

**Not supported:** stock/non-rooted TVs, Developer Mode–only setups without root, and TVs without Homebrew Channel. Sideloading the app onto an unrooted TV will not give you a working terminal.

## Getting started

See **[README.install.md](README.install.md)** for step-by-step installation and first-launch instructions.

Quick summary (rooted TVs only):

1. **Root your TV** and install Homebrew Channel — this is mandatory, not optional.
2. Sideload webOS Terminal from a computer — see **[README.install.md](README.install.md)**.
3. Launch **webOS Terminal** from your app list.

By default the shell runs as **`prisoner` (non-root)** — enough for normal Linux commands. Optional **root** (and PTY) needs elevating the service: **[Running as root](README.install.md#running-as-root)**.

## Status

This is an **early MVP**. It works for basic interactive shell use on rooted devices.

### PTY support

A real terminal session (job control, shell readline, tab completion, `vim`, `htop`, `less`, `tmux`) needs a pseudo-terminal (PTY), which the default jailed `prisoner` user can't allocate (`/dev/ptmx` is blocked). To fix this, the app ships **`ptybridge`** — a small native helper (`native/ptybridge/ptybridge.c`) that allocates and bridges a real PTY itself, independent of whatever shell it inherited from.

When the service reports a working PTY, the client switches to **raw character passthrough**: every keystroke goes straight to the shell, and the shell/TTY owns echo, history, completion, and full-screen apps. Without a PTY (piped fallback), the app keeps its client-side line buffer and up/down history instead.

The service picks the right prebuilt binary for your TV's CPU automatically at runtime (matched against `process.arch`), and it's compiled statically so it has no runtime library dependencies:

| Architecture | Binary | Covers |
|---|---|---|
| ARMv7 (hard-float) | `services/bin/ptybridge-armv7` | Most LG webOS TVs |
| ARM64 | `services/bin/ptybridge-aarch64` | Newer TVs/SoCs |
| x86_64 | `services/bin/ptybridge-x86_64` | webOS OSE emulator, x86-based firmware |

If `ptybridge` isn't available or fails on a given TV's firmware, the app falls back to `script`-based PTY allocation, and finally to a plain piped shell (no PTY, client-side line history only) — so the terminal keeps working either way, just with fewer capabilities in the fallback tiers.

Running the shell service as **root** removes the jail's filesystem restrictions, which `ptybridge` needs to open `/dev/ptmx` — see **[Running as root](README.install.md#running-as-root)** for setup steps.

Feedback and contributions are welcome.

## webOS version support

LG ships a different web engine on each major webOS TV release. This app ships **one IPK** with two boot tiers:

| Tier | webOS | Engine floor | What we do |
|---|---|---|---|
| **First-class** | 4.x and newer | Chromium 53+ | Primary support; full React / xterm UI |
| **Experimental** | 3.x | Chromium 38 | Shared modern app + polyfills + syntax downlevel to Chrome 38 |
| **Legacy shell** | 1.x–2.x | WebKit 537–538 | **Cut-down** vanilla ES5 UI (`src/legacy-webos2/`) — not the full app |

| webOS TV | Year | Web engine | Status | Notes |
|---|---|---|---|---|
| **1.x** | 2014 | WebKit 537.41 | **Legacy shell** | Cut-down terminal only; see [Legacy shell (webOS 1–2)](#legacy-shell-webos-12) |
| **2.x** | 2015 | WebKit 538.2 | **Legacy shell** | Same cut-down UI; dual-boot loader selects it automatically |
| **3.x** | 2016–2017 | Chromium 38 | **Experimental — attempted** | Syntax downlevel + `src/compat/legacy/webos3` polyfills; needs device confirmation |
| **4.x** | 2018–2019 | Chromium 53 | **Should work** | First-class tier; needs device confirmation |
| **5.x** | 2020 | Chromium 68 | **Should work** | Same first-class tier as 4.x |
| **6.x** | 2021 | Chromium 79 | **Known working** | Tested on UP7550PTC / 6.5.3 |
| **22** | 2022 | Chromium 87 | **Should work** | Year-named releases continue the Chromium line |
| **23** | 2023 | Chromium 94 | **Should work** | |
| **24** | 2024 | Chromium 108 | **Should work** | |
| **25** | 2025 | Chromium 120 | **Known working** | Tested on OLED55C56LB |
| **26** | 2026 | Chromium 132 | **Should work** | |

Engine versions are from [LG’s web engine documentation](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine). Status meanings:

- **Known working** — exercised on real hardware (see [Tested on](#tested-on))
- **Should work** — first-class Chromium tier; not yet confirmed on a specific set here
- **Experimental — attempted** — we actively try to boot the shared modern app; not yet confirmed on hardware
- **Legacy shell** — separate cut-down UI for pre-Chromium WebKit; not feature-parity with webOS 4+

### Legacy shell (webOS 1–2)

Ancient webOS TVs (1.x–2.x) use **WebKit 537–538**, not Chromium. React, Enact, and xterm.js **cannot** run there — users previously saw a **blank screen**.

This project ships a **cut-down legacy terminal** for those devices:

| | Full app (webOS 4+) | Legacy shell (webOS 1–2) |
|---|---|---|
| UI stack | React 19 + Enact + xterm | Vanilla ES5 DOM |
| Tabs / search / settings | Yes | No (single session) |
| ANSI / full-screen TUIs | High fidelity | Basic CSI + alt-screen subset; TUIs best-effort |
| Shell service | Same Luna service | Same protocol (`PalmServiceBridge`) |
| Package | One IPK | Dual-boot: loader picks entry by engine |

**Boot path:** `dist/index.html` detects pre-Chromium WebKit (or sdkVersion ≤ 2) and loads `legacy-webos2.js` + `legacy-webos2.css` instead of `main.js`. Source lives in [`src/legacy-webos2/`](src/legacy-webos2/). Pack step: `npm run pack-legacy` + `scripts/inject-legacy-boot.js`.

**Service note:** JS services on webOS 2 run **Node.js 0.10**. `services/shell_service.js` uses `bufferFrom` / `pathIsExecutable` helpers so the same service works on 0.10 and newer Node.

Rooted TV + Homebrew Channel are required for the package service. Default shell is **non-root (`prisoner`)** with real Linux commands; elevate only if you want root. There is no mock/offline fake shell.

### Legacy ringfencing (webOS 3 polyfills & platform detection)

webOS 3 is **Chromium 38** — still below modern React/xterm assumptions, but close enough that the **shared modern bundle** is attempted with heavy downleveling and polyfills (separate from the webOS 1–2 legacy shell).

| Layer | Location | Rule |
|---|---|---|
| Platform detection | `src/compat/platform.js` | Parses UA / `webOSSystem` for version (modern path) |
| Dual-boot loader | `scripts/inject-legacy-boot.js` | Chooses `legacy-webos2.js` vs `main.js` |
| Legacy UI (webOS 1–2) | `src/legacy-webos2/` | Cut-down ES5 terminal only |
| Modern polyfills | `src/compat/polyfills/modern.js` | webOS 4+ only |
| webOS 3 polyfills | `src/compat/legacy/webos3/` | Chromium 38 shims |
| webOS 2 polyfills | `src/compat/legacy/webos2/` | Minimal shims if anything shared still loads |
| Feature code | `src/views/`, `src/services/`, … | Must not branch on webOS version; use `src/compat` |

**Build floor (modern path):** `browserslist` and `scripts/downlevel-syntax.js` target **Chrome 38**. The legacy path is plain ES5 and is not run through that toolchain.

### Package size

The IPK used to ship the full iLib locale tree (~39 MB of JSON for every language). The pack step now runs `scripts/prune-dist.js`, which keeps only root + English locale data and drops redundant font files. Rebuild with `npm run build` (then package with `ares-package`) to pick up the smaller IPK.

## License

MIT

## Tested on

| Device | webOS | Result |
|---|---|---|
| OLED55C56LB | 25 | Known working |
| UP7550PTC | 6.5.3 | Known working |

If you confirm another model/version, a PR or issue with the row above is welcome.

## Reporting issues

If you run into a problem, please open a GitHub issue at:

https://github.com/gprot42/webos-terminal/issues
