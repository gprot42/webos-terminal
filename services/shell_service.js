var child_process = require('child_process');
var crypto = require('crypto');
var fs = require('fs');
var Service = require('webos-service');

var serviceInfo = require('./services.json');
var service = new Service(serviceInfo.id);

var sessions = {};

function makeSessionId () {
	return crypto.randomBytes(8).toString('hex');
}

function getSession (sessionId) {
	return sessions[sessionId];
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

	try {
		fs.accessSync(candidate, fs.constants.X_OK);
		return candidate;
	} catch (err) {
		return null;
	}
}

var SCRIPT_BIN_CANDIDATES = ['/usr/bin/script', '/bin/script'];

function findScriptBinary () {
	var i;

	for (i = 0; i < SCRIPT_BIN_CANDIDATES.length; i++) {
		try {
			fs.accessSync(SCRIPT_BIN_CANDIDATES[i], fs.constants.X_OK);
			return SCRIPT_BIN_CANDIDATES[i];
		} catch (err) {
			// try next candidate
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
	var proc = child_process.spawn(bin, args, spawnOpts);
	var settled = false;
	var pending = [];

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
			proc.kill('SIGKILL');
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

	spawnWithHangDetection(
		bridgeBin,
		[String(cols), String(rows), '--', '/bin/sh', '-i'],
		{env: env, cwd: cwd, stdio: ['pipe', 'pipe', 'pipe', 'pipe']},
		function (proc, usingPty, pending) {
			if (usingPty) {
				onReady(proc, true, pending, proc.stdio[3]);
			} else {
				tryScriptThenPiped();
			}
		}
	);
}

function resolveCwd (requestedCwd) {
	var fallback = process.env.HOME || '/tmp';

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
		subscribed: true
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
			data: Buffer.from(text).toString('base64')
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

	session.shell.stdin.write(Buffer.from(payload.data, 'base64'));
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
	}

	message.respond({returnValue: true});
});