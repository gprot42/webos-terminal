# Plan: Native Terminal for webOS (Enact)

## 1. Overview

**Project Goal**  
Create a modern, native terminal emulator that runs directly on LG webOS TVs, built with the **Enact** framework.

The goal is to provide a first-class, remote-friendly terminal experience that feels native to webOS, without requiring a computer for basic shell access and file operations.

## 2. Problem Statement

Power users, developers, and tinkerers on webOS currently lack a good way to interact with the underlying Linux shell directly on the TV.

### Existing Paths & Their Limitations

| Method | How it Works | Limitations | Usability |
|--------|--------------|-------------|---------|
| **SSH via Homebrew Channel** | Enable SSH in Homebrew Channel, then connect from a PC using `dev-manager-desktop`, `ares-cli`, or a regular SSH client | Requires a second device (PC/laptop). Not usable when away from computer. | Medium |
| **dev-manager-desktop Terminal** | Uses xterm.js in a desktop app to connect via SSH | Runs on PC, not on the TV. No native TV experience. | Medium |
| **wTerm (old)** | Old Enyo-based terminal from Palm/HP era | Abandoned, uses deprecated Enyo framework, poor compatibility with modern webOS | Low |
| **LG Developer Mode + ares-cli** | Official development tooling | Limited permissions, clunky workflow, not designed for daily use | Low |

**Current Gap**: There is **no modern, native terminal app** that runs directly on the TV using current webOS technologies (Enact + modern web stack).

## 3. Proposed Solution

Build a **native terminal application** using **Enact** (the current recommended UI framework for webOS) that provides:

- Interactive shell access
- Good remote control + Magic Remote support
- File browsing / basic file management
- Clean, TV-optimized UI

### Why an Enact-based Native Terminal is Unique & Valuable

| Benefit | Explanation |
|-------|-------------|
| **Runs directly on the TV** | No need for a computer. Useful when traveling, in living room setups, or for quick debugging |
| **Native webOS integration** | Proper Enact components, consistent theming, excellent D-pad / Magic Remote navigation |
| **Better discoverability** | Appears in the app launcher like any other app (via Homebrew Channel) |
| **Lower friction for users** | Especially valuable for users who root their TV mainly for customization and tinkering |
| **Extensibility** | Can later be combined with file manager, log viewer, package manager, etc. |
| **Fills a real gap** | While SSH from PC works, many users want a terminal *on the device itself* |

This approach is complementary to SSH — it doesn’t replace remote access, but adds a convenient on-device option.

## 4. Technical Approach

### Core Technologies
- **Enact** + **Sandstone** theme (for modern webOS look and feel)
- **xterm.js** (or similar) for terminal rendering
- WebOS services for shell execution (via `luna://` or Node.js service)
- Optional: Use of Homebrew Channel elevated execution service for better access on rooted devices

### Key Challenges
- Getting real shell/PTY access on webOS (especially on non-rooted devices)
- Handling input (remote control + on-screen keyboard)
- Performance and memory usage on TV hardware
- Proper lifecycle management (backgrounding, resuming)

### MVP Scope (Phase 1)

- Basic interactive terminal using xterm.js
- Support for common commands
- Remote-friendly navigation and input
- Basic theming consistent with webOS
- Installable via Homebrew Channel
- Works on rooted devices (primary target)

### Future Enhancements (Phase 2+)
- Integrated file manager / file browser
- Multiple tabs or sessions
- Command history and autocomplete
- Syntax highlighting for common tools
- Log viewer / `journalctl` integration
- Better support for non-rooted devices (limited shell)

## 5. Project Phases & Milestones

| Phase | Focus | Estimated Time | Deliverable |
|-------|-------|----------------|-------------|
| **Phase 0** | Research & Prototyping | 1–2 weeks | Working xterm.js + Enact prototype + shell execution method |
| **Phase 1** | MVP Terminal | 4–8 weeks | Usable terminal app installable via Homebrew |
| **Phase 2** | Polish & File Management | 4–6 weeks | Improved UX + basic file browser |
| **Phase 3** | Advanced Features | Ongoing | Tabs, theming, power features |

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|----------|
| Shell execution limitations on non-rooted devices | High | Focus primarily on rooted devices first; document limitations clearly |
| Performance on older TVs | Medium | Optimize xterm.js settings and test on multiple webOS versions |
| Input handling complexity | Medium | Leverage Enact’s Spotlight system heavily |
| Maintenance burden | Medium | Keep scope focused on MVP initially |

## 7. Success Metrics

- App can be installed and launched via Homebrew Channel
- Users can run basic commands interactively
- Good remote control navigation (no mouse required)
- Positive feedback from webOS community (Homebrew, Discord, Reddit)
- At least one meaningful update or feature addition after initial release

## 8. Why This Project Makes Sense Now

- webOS Homebrew ecosystem is mature and active.
- Enact + Sandstone is well-supported.
- There is clear demand for better on-device tooling among power users.
- A native terminal is a natural complement to existing tools like the Homebrew Channel and dev-manager-desktop.

---

**Would you like me to also create:**
- A `README.md` draft?
- A more detailed technical architecture section?
- A phased development checklist / task breakdown?

This plan is realistic and positions the project as a genuine gap-filler rather than competing with SSH access.
