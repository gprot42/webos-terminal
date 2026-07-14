# Cut-down legacy shell for webOS 1–2

This document describes the **legacy terminal** shipped for ancient LG webOS TVs (WebKit 537–538). It is intentionally a **reduced feature set**, not a port of the full modern app.

## Problem

On webOS 1.x–2.x the app shell is **WebKit**, not Chromium. Loading the React 19 + Enact + xterm bundle fails at parse/runtime and leaves a **blank screen**. Homebrew Channel may also mark the package incompatible with the webOS version.

## Solution

One IPK, **dual boot**:

1. `index.html` runs a tiny ES5 detector.
2. Pre-Chromium WebKit / sdkVersion ≤ 2 → `legacy-webos2.js` + `legacy-webos2.css`.
3. Otherwise → `main.js` + `main.css` (full app).

Developers can force the legacy UI on a desktop browser with `?legacy=1` or `localStorage.webosTerminalForceLegacy = '1'`.

## What “cut-down” means

| Included | Not included |
|---|---|
| Single interactive shell session | Multi-tab UI |
| Basic ANSI (colors, cursor, erase, alt-screen subset) | Full xterm.js fidelity / search |
| Line edit + history (piped mode); raw keys when PTY | Enact Spotlight / settings panels |
| Toolbar keys + system VKB via hidden textarea | Font pack / theme system |
| Same Luna shell service protocol | Feature parity guarantee for `vim`/`htop` |

A **rooted TV + Homebrew Channel** are required so the package service can run. Default shell is **non-root (`prisoner`)** — enough for real Linux commands. Root is optional (elevate). There is **no mock/offline fake shell**; if the service is missing the UI shows an error.

## Source and build

| Path | Role |
|---|---|
| `src/legacy-webos2/` | ES5 UI, terminal, Palm bridge client |
| `scripts/pack-legacy-webos2.js` | Concatenate → `dist/legacy-webos2.js` |
| `scripts/inject-legacy-boot.js` | Rewrite `dist/index.html` dual-boot |
| `services/shell_service.js` | Node **0.10**-safe helpers for webOS 2 services |

```bash
npm run pack-legacy          # legacy assets only
npm run pack-p               # full modern pack + legacy + inject
npm run build                # pack-p + copy service into dist
```

## Phases implemented

| Phase | Status |
|---|---|
| P0 Dual-boot loader, never blank | Done |
| P1 Vanilla UI + real shell (no mock) | Done |
| P2 PalmServiceBridge + real open/write | Done |
| P3 Node 0.10 service helpers (`bufferFrom`, `pathIsExecutable`) | Done |
| P4 ANSI subset + alt screen | Done |

## Device testing checklist (webOS 2.1.0)

1. Install IPK (Homebrew may still warn “incompatible” — launch anyway).
2. Confirm **Legacy** badge + cut-down banner (not blank).
3. Status: `mode=native · prisoner` (default) or `mode=native · root` after elevate.
4. Without elevate: `whoami` → `prisoner`; real commands (`ls`, `id`, pipelines) work.
5. After elevate + relaunch: `whoami` → `root`; optional PTY / `vi` / `htop`.
6. Toolbar Tab / arrows / Ctrl+C and on-screen keyboard.
7. No mock mode — service failure shows an error, not fake commands.

## Messaging for users

Prefer wording like:

> webOS 1–2 are supported with a **cut-down legacy shell**. For the full multi-tab terminal experience, use webOS 4 or newer.
