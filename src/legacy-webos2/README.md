# Legacy shell (webOS 1–2)

Cut-down terminal UI for **ancient webOS TV** releases that use **WebKit 537–538** (not Chromium).

| webOS | Engine | This shell |
|---|---|---|
| 1.x–2.x | WebKit 537–538 | **Yes** — `legacy-webos2.js` |
| 3.x | Chromium 38 | No — experimental modern path |
| 4.x+ | Chromium 53+ | No — full React / xterm app |

## Why a separate shell?

React 19, Enact Limestone, and xterm.js cannot run on WebKit 538. This tree is **vanilla ES5** + a small ANSI terminal and `PalmServiceBridge` client so rooted webOS 2 TVs get a usable shell without blank screens.

## What you get (cut-down)

- Single session (no multi-tab)
- Basic ANSI / cursor / colors + alt-screen subset
- Line editing + local history when the shell is piped
- Raw PTY passthrough when the service reports `usingPty`
- Large remote-friendly toolbar (Tab, Esc, arrows, Ctrl+C, VKB)
- Honest banner: legacy / limited vs webOS 4+

## What you do not get

- Full xterm fidelity / search / multi-tab UI
- Enact Spotlight chrome
- Guaranteed full-screen TUIs (`vim`, `htop`) — best-effort with PTY only

## Files

| File | Role |
|---|---|
| `bridge.js` | Luna `PalmServiceBridge` client |
| `ansi-terminal.js` | Screen buffer + CSI subset |
| `shell-session.js` | open/write/homebrew or hard error (no mock) |
| `app.js` | DOM UI (status: prisoner or root) |
| `entry.js` | Boot |
| `styles.css` | Simple layout |

Built by `scripts/pack-legacy-webos2.js` into `dist/legacy-webos2.js` + `.css`. The dual-boot snippet in `index.html` (injected by `scripts/inject-legacy-boot.js`) chooses this path when the engine is pre-Chromium WebKit.
