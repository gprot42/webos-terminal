var child_process = require('child_process');
var crypto = require('crypto');
var fs = require('fs');
var Service = require('webos-service');

// Node 0.10 (webOS 2.x) compatibility helpers. webOS 3–4 use 0.12; 5+ are modern.
// Prefer Buffer.from / fs.constants when present; fall back for ancient Node.
function bufferFrom (data, encoding) {
	if (typeof Buffer.from === 'function') {
		return encoding != null ? Buffer.from(data, encoding) : Buffer.from(data);
	}

	if (encoding != null) {
		return new Buffer(data, encoding);
	}

	if (typeof data === 'string') {
		return new Buffer(data, 'utf8');
	}

	return new Buffer(data);
}

function pathIsExecutable (candidate) {
	try {
		if (typeof fs.accessSync === 'function' && fs.constants && fs.constants.X_OK != null) {
			fs.accessSync(candidate, fs.constants.X_OK);
			return true;
		}

		// Node 0.10: no fs.accessSync — use mode bits
		var st = fs.statSync(candidate);
		return !!(st.mode & parseInt('111', 8));
	} catch (err) {
		return false;
	}
}

// True when the JS service itself runs as uid 0 (elevated via Homebrew Channel).
// Jailed "prisoner" services cannot open /dev/ptmx or escape the homebrew jail.
function serviceIsRoot () {
	try {
		if (typeof process.getuid === 'function') {
			return process.getuid() === 0;
		}
	} catch (err) {
		// ignore
	}

	return false;
}

function serviceIdentity () {
	var uid = null;
	var euid = null;

	try {
		if (typeof process.getuid === 'function') {
			uid = process.getuid();
		}
	} catch (err) {
		// ignore
	}

	try {
		if (typeof process.geteuid === 'function') {
			euid = process.geteuid();
		}
	} catch (err2) {
		// ignore
	}

	return {
		uid: uid,
		euid: euid,
		isRoot: uid === 0 || euid === 0
	};
}

// Node 0.10 (webOS 2) stdio arrays beyond 3 fds are unreliable; ptybridge's
// resize channel needs fd 3. Detect modern-enough Node before using 4 pipes.
function supportsExtraStdio () {
	var m = /^v?(\d+)\.(\d+)/.exec(process.version || '');

	if (!m) {
		return false;
	}

	var major = parseInt(m[1], 10);
	var minor = parseInt(m[2], 10);

	if (major > 0) {
		return true;
	}

	return minor >= 12;
}

// When elevated as root, keep elevation sticky across reboots/app updates by
// installing a Homebrew Channel init.d hook (idempotent).
function ensureBootElevateHook () {
	if (!serviceIsRoot()) {
		return;
	}

	var dir = '/var/lib/webosbrew/init.d';
	var hookPath = dir + '/50-webos-terminal-elevate';
	var body = [
		'#!/bin/sh',
		'# Installed by webOS Terminal service when running as root.',
		'ELEV="/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service"',
		'SVC="com.github.gprot42.webosterminal.service"',
		'if [ -x "$ELEV" ]; then',
		'  "$ELEV" "$SVC" >/dev/null 2>&1 || true',
		'fi',
		'/usr/sbin/ls-control scan-services >/dev/null 2>&1 || true',
		'pkill -f "$SVC" >/dev/null 2>&1 || true',
		''
	].join('\n');

	try {
		try {
			fs.mkdirSync('/var/lib/webosbrew');
		} catch (errMk1) {
			// exists
		}

		try {
			fs.mkdirSync(dir);
		} catch (errMk2) {
			// exists
		}

		if (fs.existsSync(hookPath)) {
			try {
				if (fs.readFileSync(hookPath, 'utf8') === body) {
					return;
				}
			} catch (errRead) {
				// rewrite
			}
		}

		fs.writeFileSync(hookPath, body);

		try {
			fs.chmodSync(hookPath, '755');
		} catch (errChmod) {
			// best-effort
		}
	} catch (err) {
		// not fatal — elevation still works via app/install path
	}
}

var serviceInfo = require('./services.json');
var service = new Service(serviceInfo.id);

var sessions = {};
var uiSessionId = null;
var automationPassword = 'webos';

// Best-effort: install boot hook as soon as an elevated service starts.
ensureBootElevateHook();

function makeSessionId () {
	return crypto.randomBytes(8).toString('hex');
}

function getSession (sessionId) {
	return sessions[sessionId];
}

function getUiSession () {
	if (uiSessionId && sessions[uiSessionId]) {
		return sessions[uiSessionId];
	}

	// fallback: only session (single-tab automation)
	var ids = Object.keys(sessions);
	if (ids.length === 1) {
		return sessions[ids[0]];
	}

	return null;
}

function checkAutomationPassword (payload) {
	var provided = payload.password || payload.automationPassword || '';

	return provided === automationPassword;
}

var SHELL_NOISE = [
	/[^\n]*can't access tty[;:] job control turned off[^\n]*\r?\n?/g,
	/[^\n]*failed to create pseudo-terminal[^\n]*\r?\n?/g
];

function filterShellNoise (text) {
	var filtered = text;
	var i;

	for (i = 0; i < SHELL_NOISE.length; i++) {
		filtered = filtered.replace(SHELL_NOISE[i], '');
	}

	return filtered;
}

// The service jail normally has no PTY devices (/dev/ptmx), so `/bin/sh -i`
// runs piped -- no job control, no readline in the shell itself (we emulate
// line editing client-side instead). Three ways to get a real PTY are tried,
// in order of preference, each falling back to the next on failure:
//
//   1. ptybridge: our own native helper (native/ptybridge/ptybridge.c) that
//      allocates a pty and explicitly makes itself the controlling terminal
//      of the shell via setsid()+TIOCSCTTY -- so it doesn't need the
//      *service* to have a controlling terminal at all (it has none).
//   2. `script`: util-linux's pty wrapper. Works on some systems, but on
//      this TV it hangs silently because it expects to inherit a
//      controlling terminal from its caller, which the headless service
//      doesn't have.
//   3. A plain piped shell (no pty at all) -- always works, but no job
//      control and weak/no support for full-screen TUIs.
//
// Both PTY attempts (1 and 2) get a short window to prove they're actually
// producing output before being trusted; if nothing arrives, they're killed
// and the next option is tried.
var PTY_BRIDGE_ARCH = {arm: 'armv7', arm64: 'aarch64', x64: 'x86_64'};
var HANG_DETECT_MS = 800;

function findPtyBridgeBinary () {
	var arch = PTY_BRIDGE_ARCH[process.arch];

	if (!arch) {
		return null;
	}

	var candidate = __dirname + '/bin/ptybridge-' + arch;

	if (pathIsExecutable(candidate)) {
		return candidate;
	}

	return null;
}

var SCRIPT_BIN_CANDIDATES = ['/usr/bin/script', '/bin/script'];

function findScriptBinary () {
	var i;

	for (i = 0; i < SCRIPT_BIN_CANDIDATES.length; i++) {
		if (pathIsExecutable(SCRIPT_BIN_CANDIDATES[i])) {
			return SCRIPT_BIN_CANDIDATES[i];
		}
	}

	return null;
}

function spawnPipedShell (env, cwd) {
	return child_process.spawn('/bin/sh', ['-i'], {env: env, cwd: cwd});
}

// Spawns `bin` with `args`/`spawnOpts` and gives it HANG_DETECT_MS to prove
// it's actually producing output on stdout. Calls
// `onSettled(proc, usingPty, pendingStdout)` exactly once: either with the
// still-running process once output arrives (pty confirmed working), or
// with `usingPty: false` if it errored or stayed silent (and has been
// killed) so the caller can fall back to the next option.
function spawnWithHangDetection (bin, args, spawnOpts, onSettled) {
	var proc;
	var settled = false;
	var pending = [];

	try {
		proc = child_process.spawn(bin, args, spawnOpts);
	} catch (err) {
		onSettled(null, false, []);
		return;
	}

	if (!proc || !proc.stdout) {
		onSettled(null, false, []);
		return;
	}

	function bufferChunk (chunk) {
		pending.push(chunk);
	}

	proc.stdout.on('data', bufferChunk);

	function stopBuffering () {
		proc.stdout.removeListener('data', bufferChunk);
	}

	proc.once('error', function () {
		if (settled) {
			return;
		}

		settled = true;
		stopBuffering();
		onSettled(null, false, []);
	});

	setTimeout(function () {
		if (settled) {
			return;
		}

		settled = true;
		stopBuffering();

		if (pending.length) {
			onSettled(proc, true, pending);
		} else {
			try {
				proc.kill('SIGKILL');
			} catch (errKill) {
				// ignore
			}
			onSettled(null, false, []);
		}
	}, HANG_DETECT_MS);
}

// Spawns the interactive shell, preferring a real PTY (ptybridge, then
// `script`) and falling back to a piped shell. `onReady(shell, usingPty,
// pendingStdout, resizeStream)` is called once a shell process is running.
// `pendingStdout` is an array of Buffers already emitted by the shell before
// the caller could attach its own listeners, and must be replayed through
// the normal output path. `resizeStream` is the writable side of ptybridge's
// fd-3 resize channel, or null when not using ptybridge.
function spawnInteractiveShell (env, cwd, cols, rows, onReady) {
	// The prisoner jail blocks /dev/ptmx — skip PTY attempts until elevated.
	if (!serviceIsRoot()) {
		onReady(spawnPipedShell(env, cwd), false, [], null);
		return;
	}

	var bridgeBin = findPtyBridgeBinary();

	function tryScriptThenPiped () {
		var scriptBin = findScriptBinary();

		if (!scriptBin) {
			onReady(spawnPipedShell(env, cwd), false, [], null);
			return;
		}

		// util-linux `script -qc "<cmd>" /dev/null` allocates a pty and runs
		// <cmd> attached to its slave side, discarding the typescript log.
		spawnWithHangDetection(
			scriptBin,
			['-qc', '/bin/sh -i', '/dev/null'],
			{env: env, cwd: cwd},
			function (proc, usingPty, pending) {
				if (usingPty) {
					onReady(proc, true, pending, null);
				} else {
					onReady(spawnPipedShell(env, cwd), false, [], null);
				}
			}
		);
	}

	if (!bridgeBin) {
		tryScriptThenPiped();
		return;
	}

	// Prefer 4-fd spawn for resize channel when Node supports it; otherwise
	// run ptybridge without the resize pipe (still a real PTY).
	var spawnOpts;

	if (supportsExtraStdio()) {
		spawnOpts = {env: env, cwd: cwd, stdio: ['pipe', 'pipe', 'pipe', 'pipe']};
	} else {
		spawnOpts = {env: env, cwd: cwd};
	}

	spawnWithHangDetection(
		bridgeBin,
		[String(cols), String(rows), '--', '/bin/sh', '-i'],
		spawnOpts,
		function (proc, usingPty, pending) {
			if (usingPty) {
				var resizeStream = (proc.stdio && proc.stdio[3]) || null;
				onReady(proc, true, pending, resizeStream);
			} else {
				tryScriptThenPiped();
			}
		}
	);
}

function resolveCwd (requestedCwd) {
	var fallback = process.env.HOME || (serviceIsRoot() ? '/home/root' : '/tmp');

	if (serviceIsRoot() && fallback &&
		(fallback.indexOf('prisoner') !== -1 || fallback === '/media/developer')) {
		fallback = '/home/root';
	}

	if (!requestedCwd) {
		return fallback;
	}

	try {
		if (fs.statSync(requestedCwd).isDirectory()) {
			return requestedCwd;
		}
	} catch (err) {
		// requested directory no longer exists -- fall back to HOME
	}

	return fallback;
}

service.register('open', function (message) {
	var payload = message.payload || {};
	var cols = payload.cols || 80;
	var rows = payload.rows || 24;
	var sessionId = makeSessionId();
	var identity = serviceIdentity();
	var cwd = resolveCwd(payload.cwd);

	var env = {};
	var key;
	for (key in process.env) {
		if (Object.prototype.hasOwnProperty.call(process.env, key)) {
			env[key] = process.env[key];
		}
	}
	env.TERM = 'xterm-256color';
	env.COLUMNS = String(cols);
	env.LINES = String(rows);

	// When elevated, give the interactive shell a real root home instead of
	// whatever jailed HOME the service process may have inherited.
	if (identity.isRoot) {
		if (!env.HOME || env.HOME.indexOf('prisoner') !== -1 ||
			env.HOME === '/media/developer' || env.HOME.indexOf('/home/developer') === 0) {
			env.HOME = '/home/root';
		}
		env.USER = 'root';
		env.LOGNAME = 'root';
		cwd = resolveCwd(payload.cwd || env.HOME);
	}

	// Re-assert boot hook each open while root (cheap, idempotent).
	ensureBootElevateHook();

	spawnInteractiveShell(env, cwd, cols, rows, function (shell, usingPty, pendingStdout, resizeStream) {
		startSession(shell, usingPty, pendingStdout, resizeStream);
	});

	function startSession (shell, usingPty, pendingStdout, resizeStream) {
	sessions[sessionId] = {
		shell: shell,
		cols: cols,
		rows: rows,
		usingPty: usingPty,
		resizeStream: resizeStream || null
	};

	message.respond({
		returnValue: true,
		sessionId: sessionId,
		usingPty: usingPty,
		subscribed: true,
		isRoot: identity.isRoot,
		uid: identity.uid,
		euid: identity.euid
	});

	function sendOutput (type, chunk) {
		var text = filterShellNoise(chunk.toString());

		if (!text) {
			return;
		}

		message.respond({
			returnValue: true,
			sessionId: sessionId,
			type: type,
			data: bufferFrom(text).toString('base64')
		});
	}

	// The job-control warning is emitted once, at startup, on stderr and may be
	// split across chunks -- so a per-chunk filter can miss it. Buffer the first
	// bit of stderr until the warning line completes (a newline arrives) or a
	// short grace period elapses, filter the assembled text, then pass through.
	var noiseCleared = false;
	var noiseBuffer = '';
	var noiseTimer = null;

	function flushStartupNoise () {
		if (noiseCleared) {
			return;
		}

		noiseCleared = true;

		if (noiseTimer) {
			clearTimeout(noiseTimer);
			noiseTimer = null;
		}

		var pending = noiseBuffer;
		noiseBuffer = '';

		if (pending) {
			sendOutput('stderr', pending);
		}
	}

	function handleStderr (chunk) {
		if (noiseCleared) {
			sendOutput('stderr', chunk);
			return;
		}

		noiseBuffer += chunk.toString();

		if (noiseBuffer.indexOf('\n') !== -1 || noiseBuffer.length > 4096) {
			flushStartupNoise();
		}
	}

	noiseTimer = setTimeout(flushStartupNoise, 500);

	// Replay any output the shell emitted before we could attach the
	// listener below (see spawnInteractiveShell's PTY-hang detection).
	(pendingStdout || []).forEach(function (chunk) {
		sendOutput('stdout', chunk);
	});

	shell.stdout.on('data', function (data) {
		sendOutput('stdout', data);
	});

	shell.stderr.on('data', function (data) {
		handleStderr(data);
	});

	shell.on('close', function (code) {
		if (noiseTimer) {
			clearTimeout(noiseTimer);
			noiseTimer = null;
		}

		message.respond({
			returnValue: true,
			sessionId: sessionId,
			type: 'exit',
			exitCode: code
		});
		if (uiSessionId === sessionId) {
			uiSessionId = null;
		}

		delete sessions[sessionId];
		message.cancel();
	});

	shell.on('error', function (err) {
		message.respond({
			returnValue: false,
			errorText: err.message
		});
	});
	}
});

service.register('write', function (message) {
	var payload = message.payload || {};
	var session = getSession(payload.sessionId);

	if (!session) {
		message.respond({
			returnValue: false,
			errorText: 'Session not found'
		});
		return;
	}

	if (!payload.data) {
		message.respond({
			returnValue: false,
			errorText: 'Missing data'
		});
		return;
	}

	session.shell.stdin.write(bufferFrom(payload.data, 'base64'));
	message.respond({returnValue: true});
});

service.register('resize', function (message) {
	var payload = message.payload || {};
	var session = getSession(payload.sessionId);

	if (!session) {
		message.respond({
			returnValue: false,
			errorText: 'Session not found'
		});
		return;
	}

	session.cols = payload.cols || session.cols;
	session.rows = payload.rows || session.rows;

	if (session.resizeStream) {
		try {
			session.resizeStream.write(session.cols + ',' + session.rows + '\n');
		} catch (err) {
			// resize channel gone (process exiting) -- ignore
		}
	}

	message.respond({returnValue: true});
});

// Best-effort current-working-directory lookup for lightweight tab
// persistence. /proc may not be mounted/readable in every jail, so failures
// are expected and just mean the client won't remember that tab's directory.
//
// When using ptybridge, `session.shell.pid` is the *bridge* process, not the
// shell itself -- the bridge never chdirs, so its cwd would never reflect
// the user's `cd` commands. Resolve to the actual shell (the bridge's first
// child, which keeps the same pid across its execve of /bin/sh) via the
// /proc/<pid>/task/<pid>/children file (Linux 3.5+, no ptrace needed). For
// non-bridge sessions this file is normally empty, so it harmlessly falls
// back to the shell's own pid.
function resolveShellPid (pid) {
	try {
		var childrenRaw = fs.readFileSync('/proc/' + pid + '/task/' + pid + '/children', 'utf8').trim();

		if (childrenRaw) {
			return childrenRaw.split(/\s+/)[0];
		}
	} catch (err) {
		// no children file (older kernel, or process has no children) --
		// assume `pid` is already the shell itself
	}

	return pid;
}

service.register('getCwd', function (message) {
	var payload = message.payload || {};
	var session = getSession(payload.sessionId);

	if (!session || !session.shell || !session.shell.pid) {
		message.respond({returnValue: false, errorText: 'Session not found'});
		return;
	}

	try {
		var shellPid = resolveShellPid(session.shell.pid);
		var cwd = fs.readlinkSync('/proc/' + shellPid + '/cwd');
		message.respond({returnValue: true, cwd: cwd});
	} catch (err) {
		message.respond({returnValue: false, errorText: err.message});
	}
});

service.register('close', function (message) {
	var payload = message.payload || {};
	var session = getSession(payload.sessionId);

	if (session) {
		session.shell.kill('SIGTERM');
		delete sessions[payload.sessionId];

		if (uiSessionId === payload.sessionId) {
			uiSessionId = null;
		}
	}

	message.respond({returnValue: true});
});

service.register('registerUiSession', function (message) {
	var payload = message.payload || {};

	if (payload.sessionId && sessions[payload.sessionId]) {
		uiSessionId = payload.sessionId;

		if (typeof payload.automationPassword === 'string') {
			var nextPassword = payload.automationPassword.trim();
			automationPassword = nextPassword || 'webos';
		}

		message.respond({returnValue: true, sessionId: uiSessionId});
		return;
	}

	message.respond({returnValue: false, errorText: 'Unknown sessionId'});
});

// Lightweight identity probe (no shell). Clients use this after auto-elevate
// to confirm the service is running as root before opening a session.
service.register('status', function (message) {
	var identity = serviceIdentity();

	message.respond({
		returnValue: true,
		isRoot: identity.isRoot,
		uid: identity.uid,
		euid: identity.euid,
		nodeVersion: process.version || null,
		arch: process.arch || null,
		pid: process.pid
	});
});

service.register('listSessions', function (message) {
	var payload = message.payload || {};

	if (!checkAutomationPassword(payload)) {
		message.respond({returnValue: false, errorText: 'Invalid password'});
		return;
	}

	var list = Object.keys(sessions).map(function (id) {
		var s = sessions[id];

		return {
			sessionId: id,
			shellPid: s.shell && s.shell.pid,
			usingPty: s.usingPty,
			isUi: id === uiSessionId
		};
	});

	message.respond({returnValue: true, sessions: list, uiSessionId: uiSessionId});
});

service.register('run', function (message) {
	var payload = message.payload || {};

	if (!checkAutomationPassword(payload)) {
		message.respond({returnValue: false, errorText: 'Invalid password'});
		return;
	}

	var session = payload.sessionId
		? getSession(payload.sessionId)
		: getUiSession();
	var cmd = payload.command || payload.cmd;

	if (!session) {
		message.respond({returnValue: false, errorText: 'No UI session — open terminal app first'});
		return;
	}

	if (!cmd) {
		message.respond({returnValue: false, errorText: 'Missing command'});
		return;
	}

	session.shell.stdin.write(cmd + '\n');
	message.respond({
		returnValue: true,
		sessionId: payload.sessionId || uiSessionId,
		shellPid: session.shell.pid
	});
});