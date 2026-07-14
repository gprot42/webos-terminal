#!/usr/bin/env bash
#
# install2tvfrommacos.sh — Build and sideload webOS Terminal to a rooted LG TV.
#
# Usage:
#   ./install2tvfrommacos.sh
#   TV_IP=192.168.0.79 ./install2tvfrommacos.sh
#   TV_IP=192.168.0.79 LAUNCH=0 ./install2tvfrommacos.sh
#
# Prerequisites:
#   - npm, enact, @webosose/ares-cli
#   - Rooted TV with Homebrew Channel SSH enabled (root@TV:22)
#   - TV and Mac on the same network
#
# Environment:
#   TV_IP          TV IP address (default: 192.168.0.79)
#   DEVICE         ares device name (default: webos)
#   SSH_KEY        SSH key name under ~/.ssh (default: webos_deploy)
#   ROOT_PASSWORD  Root SSH password for first-time key setup (default: alpine)
#   LAUNCH         Launch app after install: 1 or 0 (default: 1)
#   SETUP_DEVICE   Run ares-setup-device: 1 or 0 (default: 1)

set -euo pipefail

TV_IP="${TV_IP:-192.168.0.79}"
DEVICE="${DEVICE:-webos}"
SSH_KEY="${SSH_KEY:-webos_deploy}"
ROOT_PASSWORD="${ROOT_PASSWORD:-alpine}"
LAUNCH="${LAUNCH:-1}"
SETUP_DEVICE="${SETUP_DEVICE:-1}"

APP_ID="com.github.gprot42.webosterminal"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_KEY_PATH="$HOME/.ssh/$SSH_KEY"
NODE_MAJOR="${NODE_MAJOR:-20}"

c_red() { printf '\033[31m%s\033[0m' "$*"; }
c_grn() { printf '\033[32m%s\033[0m' "$*"; }
c_ylw() { printf '\033[33m%s\033[0m' "$*"; }
section() { printf "\n\033[1;36m━━ %s ━━\033[0m\n" "$*"; }
die() { printf "%s\n" "$(c_red "error: $*")" >&2; exit 1; }

ares_cmd() {
	local name="$1"
	shift
	local js
	js="$(ares_js "$name")"
	node20 "$js" "$@"
}

ares_js() {
	local name="$1"
	local roots
	roots="$(npm root -g 2>/dev/null || true)"
	for pkg in @webosose/ares-cli @webos-tools/cli; do
		local js="$roots/$pkg/bin/${name}.js"
		if [[ -f "$js" ]]; then
			echo "$js"
			return 0
		fi
	done
	die "Could not find ${name}.js in global npm packages"
}

node20() {
	local bin
	# type -P finds PATH binaries only; command -v would match this function when NODE_MAJOR=20
	bin="$(type -P "node${NODE_MAJOR}" 2>/dev/null || true)"
	if [[ -n "$bin" ]]; then
		"$bin" "$@"
		return
	fi
	npx -y "node@${NODE_MAJOR}" "$@"
}

ssh_tv() {
	ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no \
		-i "$SSH_KEY_PATH" "root@${TV_IP}" "$@"
}

# This TV's /usr/bin/luna-send-pub is a very old (2011) build with different
# flag semantics than modern luna-send: the uri/message are POSITIONAL args,
# and "-i" means "interactive mode" (NOT "pass a uri"). It also fully buffers
# stdout when not attached to a tty, so a plain non-interactive SSH exec loses
# all output even though the call itself still runs. Route these through a
# pty (-tt) and use positional args so we can actually see (and verify) the
# result.
luna_send_tv() {
	ssh -tt -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=no \
		-i "$SSH_KEY_PATH" "root@${TV_IP}" "$@" 2>&1
}

wait_for_ssh() {
	ssh_tv "true" >/dev/null 2>&1
}

read_version() {
	node "$SCRIPT_DIR/scripts/read-version.js"
}

ensure_deploy_key() {
	if [[ -f "$SSH_KEY_PATH" ]]; then
		printf "  %s\n" "$(c_grn "Using SSH key: $SSH_KEY_PATH")"
		return
	fi
	section "Creating deploy SSH key ($SSH_KEY)"
	ssh-keygen -t ed25519 -f "$SSH_KEY_PATH" -N "" -C "webos-deploy" -q
	printf "  %s\n" "$(c_grn "Created $SSH_KEY_PATH")"
}

install_key_on_tv() {
	if ssh -o BatchMode=yes -o ConnectTimeout=5 -i "$SSH_KEY_PATH" \
		-o StrictHostKeyChecking=no "root@${TV_IP}" "true" 2>/dev/null; then
		printf "  %s\n" "$(c_grn "SSH key auth already works")"
		return
	fi

	section "Installing SSH key on TV"
	local pubkey
	pubkey="$(cat "${SSH_KEY_PATH}.pub")"
	local askpass
	askpass="$(mktemp -t webos-root-askpass.XXXXXX)"
	chmod 700 "$askpass"
	printf '#!/bin/sh\nprintf "%%s" "%s"\n' "$ROOT_PASSWORD" >"$askpass"
	DISPLAY=:0 SSH_ASKPASS="$askpass" SSH_ASKPASS_REQUIRE=force \
		ssh -o StrictHostKeyChecking=no \
			-o PreferredAuthentications=password \
			-o PubkeyAuthentication=no \
			-p 22 "root@${TV_IP}" \
			"mkdir -p /home/root/.ssh && chmod 700 /home/root/.ssh && touch /home/root/.ssh/authorized_keys && chmod 600 /home/root/.ssh/authorized_keys && grep -qF '$pubkey' /home/root/.ssh/authorized_keys || echo '$pubkey' >> /home/root/.ssh/authorized_keys"
	rm -f "$askpass"

	ssh -o BatchMode=yes -o ConnectTimeout=5 -i "$SSH_KEY_PATH" \
		-o StrictHostKeyChecking=no "root@${TV_IP}" "true" \
		|| die "Could not authenticate to root@${TV_IP} with $SSH_KEY_PATH"
	printf "  %s\n" "$(c_grn "SSH key installed on TV")"
}

setup_ares_device() {
	section "Configuring ares device ($DEVICE)"
	ares_cmd ares-setup-device --remove "$DEVICE" >/dev/null 2>&1 || true
	ares_cmd ares-setup-device --add "$DEVICE" \
		--info "username=root" \
		--info "privatekey=$SSH_KEY" \
		--info "host=$TV_IP" \
		--info "port=22" \
		--info "description=Rooted LG TV"
	ares_cmd ares-setup-device --default "$DEVICE" >/dev/null
	printf "  %s\n" "$(c_grn "Device $DEVICE -> root@${TV_IP}:22")"
}

build_and_package() {
	section "Building app"
	cd "$SCRIPT_DIR"
	npm install
	npm run build

	section "Packaging IPK"
	cd "$SCRIPT_DIR/dist"
	ares_cmd ares-package --no-minify .
}

install_ipk_ssh() {
	local ipk="$1" base remote_dir remote_ipk payload version output
	base="$(basename "$ipk")"
	remote_dir="/media/developer/temp"
	remote_ipk="${remote_dir}/${base}"
	version="$(read_version)"

	# Close the app first so webOS doesn't keep the old bundle alive in an
	# already-running webview process across the reinstall.
	luna_send_tv "/usr/bin/luna-send-pub -n 1 -w 5000 'luna://com.webos.applicationManager/closeByAppId' '{\"id\":\"${APP_ID}\"}'" >/dev/null 2>&1 || true

	ssh_tv "rm -rf '${remote_dir}' && mkdir -p '${remote_dir}' && chmod 777 '${remote_dir}'"
	scp -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=no \
		-i "$SSH_KEY_PATH" "$ipk" "root@${TV_IP}:${remote_ipk}"

	payload="$(printf '{"id":"com.ares.defaultName","ipkUrl":"%s","subscribe":true}' "$remote_ipk")"
	# dev/install streams many progress replies (verifying/parsing/installing)
	# before a final "installed" state and then a disconnect message; -n 1
	# only captures the initial subscribe ack, not completion. Collect a
	# generous number of replies and look for the terminal state.
	output="$(luna_send_tv "/usr/bin/luna-send-pub -n 60 -w 90000 'luna://com.webos.appInstallService/dev/install' '${payload}'")"

	printf '%s\n' "$output" | grep -q '"state":"installed"' \
		|| die "SSH install did not reach installed state for ${APP_ID} ${version}. Output: $output"

	ssh_tv "grep -q '\"version\": *\"${version}\"' /media/developer/apps/usr/palm/applications/${APP_ID}/appinfo.json" \
		|| die "SSH install did not update ${APP_ID} to version ${version} on the TV"

	ssh_tv "rm -f '${remote_ipk}'"
	ssh_tv "/usr/sbin/ls-control scan-services" >/dev/null
}

install_ipk() {
	local version ipk install_js attempt max_attempts delay
	version="$(read_version)"
	ipk="${APP_ID}_${version}_all.ipk"
	[[ -f "$SCRIPT_DIR/dist/$ipk" ]] || die "Missing package: dist/$ipk"
	install_js="$(ares_js ares-install)"

	section "Installing to TV"
	# ares-install's SSH exec channel is flaky against this TV's dropbear (fails
	# with "Unable to exec"); one quick retry catches transient hiccups without
	# burning time on a failure mode that the SSH fallback below handles anyway.
	max_attempts=2
	delay=3
	# Dropbear on the TV can reject rapid back-to-back SSH exec channels.
	sleep 3
	for attempt in $(seq 1 "$max_attempts"); do
		wait_for_ssh || {
			printf "  %s\n" "$(c_ylw "SSH not ready (attempt $attempt/$max_attempts)")"
			sleep "$delay"
			continue
		}
		if node20 "$install_js" -d "$DEVICE" "$SCRIPT_DIR/dist/$ipk"; then
			printf "  %s\n" "$(c_grn "Installed $ipk")"
			return
		fi
		if [[ "$attempt" -lt "$max_attempts" ]]; then
			printf "  %s\n" "$(c_ylw "Install failed (attempt $attempt/$max_attempts), retrying in ${delay}s...")"
			sleep "$delay"
		fi
	done

	section "Installing via SSH fallback"
	install_ipk_ssh "$SCRIPT_DIR/dist/$ipk"
	printf "  %s\n" "$(c_grn "Installed $ipk (via SSH)")"
}

launch_app_ssh() {
	local payload output
	payload="$(printf '{"id":"%s"}' "$APP_ID")"
	output="$(luna_send_tv "/usr/bin/luna-send-pub -n 1 -w 15000 'luna://com.webos.applicationManager/launch' '${payload}'")"
	printf '%s\n' "$output" | grep -q '"returnValue":true' \
		|| die "SSH launch failed for ${APP_ID}. Output: $output"
}

elevate_service_on_tv() {
	local elev svc hook
	elev="/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service"
	svc="com.github.gprot42.webosterminal.service"
	hook="/var/lib/webosbrew/init.d/50-webos-terminal-elevate"

	section "Elevating shell service (root)"
	# Patch Luna so the JS service runs via Homebrew Channel's unjailed
	# run-js-service (uid 0). Required for real PTY + root shell on all webOS.
	if ssh_tv "test -x '${elev}'"; then
		ssh_tv "'${elev}' '${svc}'" || printf "  %s\n" "$(c_ylw "elevate-service returned non-zero (continuing)")"
		ssh_tv "/usr/sbin/ls-control scan-services >/dev/null 2>&1; pkill -f '${svc}' >/dev/null 2>&1 || true"
		# Sticky boot hook (same as README auto-elevate section)
		ssh_tv "mkdir -p /var/lib/webosbrew/init.d && cat > '${hook}' << 'EOF'
#!/bin/sh
ELEV=\"/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service\"
SVC=\"com.github.gprot42.webosterminal.service\"
if [ -x \"\$ELEV\" ]; then
  \"\$ELEV\" \"\$SVC\" >/dev/null 2>&1 || true
fi
/usr/sbin/ls-control scan-services >/dev/null 2>&1 || true
pkill -f \"\$SVC\" >/dev/null 2>&1 || true
EOF
chmod +x '${hook}'" || true
		printf "  %s\n" "$(c_grn "Service elevated + boot hook installed")"
	else
		printf "  %s\n" "$(c_ylw "Homebrew elevate-service not found — app will try Luna elevate on launch")"
	fi
}

launch_app() {
	local launch_js attempt max_attempts delay
	launch_js="$(ares_js ares-launch)"
	section "Launching app"

	# ares-launch's SSH exec channel is flaky against this TV's dropbear (fails
	# with "Unable to exec"), same as ares-install; retry then fall back to a
	# direct luna-send launch over SSH.
	max_attempts=2
	delay=3
	for attempt in $(seq 1 "$max_attempts"); do
		wait_for_ssh || {
			printf "  %s\n" "$(c_ylw "SSH not ready (attempt $attempt/$max_attempts)")"
			sleep "$delay"
			continue
		}
		if node20 "$launch_js" -d "$DEVICE" "$APP_ID"; then
			printf "  %s\n" "$(c_grn "Launched $APP_ID")"
			return
		fi
		if [[ "$attempt" -lt "$max_attempts" ]]; then
			printf "  %s\n" "$(c_ylw "Launch failed (attempt $attempt/$max_attempts), retrying in ${delay}s...")"
			sleep "$delay"
		fi
	done

	section "Launching via SSH fallback"
	launch_app_ssh
	printf "  %s\n" "$(c_grn "Launched $APP_ID (via SSH)")"
}

main() {
	section "webOS Terminal installer"
	printf "  TV: %s\n" "$TV_IP"
	printf "  Device: %s\n" "$DEVICE"

	command -v npm >/dev/null 2>&1 || die "npm is required"
	command -v enact >/dev/null 2>&1 || die "enact CLI is required"
	ares_cmd ares-package --version >/dev/null

	ensure_deploy_key
	install_key_on_tv
	[[ "$SETUP_DEVICE" == "1" ]] && setup_ares_device
	build_and_package
	install_ipk
	elevate_service_on_tv
	[[ "$LAUNCH" == "1" ]] && launch_app

	section "Done"
	printf "  %s\n" "$(c_grn "webOS Terminal is on your TV")"
	printf "  %s\n" "Default shell is non-root (prisoner). Service was elevated for root if Homebrew elevate-service was available."
}

main "$@"