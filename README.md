<p align="center">
  <img src="webos-meta/icon-large.png" alt="webOS Terminal" width="128">
</p>

# webOS Terminal

A native terminal app for LG webOS TVs. Open a shell right on your TV — no laptop required.

<p align="center">
  <img src="docs/images/screengrab1.jpg" alt="webOS Terminal running on TV with on-screen keyboard" width="800">
</p>

## What is this?

webOS Terminal brings a familiar command-line experience to your TV. Launch it from the app launcher, type commands, and interact with the Linux shell underneath webOS — all from the couch, using your remote.

It is built for people who root or homebrew their TV and want quick on-device access for tinkering, debugging, or running simple commands without SSH from another machine.

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

Planned for later:

- File browsing
- Multiple tabs
- Command history and autocomplete
- Log viewing

## Requirements

- An **LG webOS TV**
- A **rooted** TV with **Homebrew Channel** installed (primary target for now)
- webOS 4.x or newer recommended

Non-rooted TVs are not fully supported yet. Shell access on stock TVs is limited by LG’s platform restrictions.

## Getting started

See **[README.install](README.install)** for step-by-step installation and first-launch instructions.

Quick summary:

1. Root your TV and install Homebrew Channel (if you have not already).
2. Sideload webOS Terminal from a computer — see **[README.install](README.install)**.
3. Launch **webOS Terminal** from your app list.

## Status

This is an **early MVP** (v0.1.0). It works for basic interactive shell use on rooted devices. Some advanced terminal features — full-screen editors, complex TUI apps — may not behave perfectly yet.

Feedback and contributions are welcome.

## License

MIT