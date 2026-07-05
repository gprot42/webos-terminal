#!/bin/sh
# Cross-compiles ptybridge for the CPU architectures found across LG webOS
# TVs, using macOS-native Homebrew cross-toolchains (no Docker/Linux needed
# since ptybridge only uses plain POSIX APIs, no webOS-specific headers).
#
# Prerequisites (installed once):
#   brew tap messense/macos-cross-toolchains
#   brew install messense/macos-cross-toolchains/arm-unknown-linux-musleabihf
#   brew install messense/macos-cross-toolchains/aarch64-unknown-linux-musl
#   brew install messense/macos-cross-toolchains/x86_64-unknown-linux-musl

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/ptybridge.c"
OUT_DIR="$SCRIPT_DIR/../../services/bin"

mkdir -p "$OUT_DIR"

build_target () {
	name="$1"
	cc="$2"
	out="$OUT_DIR/ptybridge-$name"

	if ! command -v "$cc" >/dev/null 2>&1; then
		echo "skip $name: $cc not found (brew install messense/macos-cross-toolchains/${cc%-gcc})"
		return 0
	fi

	echo "building $name -> $out"
	"$cc" -static -O2 -Wall -Wextra -s -o "$out" "$SRC"
	chmod +x "$out"
	file "$out" || true
}

build_target armv7 arm-unknown-linux-musleabihf-gcc
build_target aarch64 aarch64-unknown-linux-musl-gcc
build_target x86_64 x86_64-unknown-linux-musl-gcc

echo "done"
