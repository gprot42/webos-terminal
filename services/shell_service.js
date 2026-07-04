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
// line editing client-side instead). If the service has been elevated
// (see README: elevate-service) and a `script` binary is present, it may be
// able to allocate a real pseudo-terminal via openpty(), which restores job
// control and lets full-screen TUIs (vim, htop, etc.) work. Try that first,
// and fall back to the piped shell immediately if `script` is missing or
// fails to spawn.
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

// Spawns the interactive shell, preferring a real PTY via `script` when
// available. `onReady(shell, usingPty, pendingStdout)` is called once a
// shell process is running (falling back if the PTY attempt errors, or is
// silently stuck -- see below). `pendingStdout` is an array of Buffers
// already emitted by the shell before the caller could attach its own
// listeners, and must be replayed through the normal output path.
function spawnInteractiveShell (env, cwd, onReady) {
	var scriptBin = findScriptBinary();

	if (!scriptBin) {
		onReady(spawnPipedShell(env, cwd), false, []);
		return;
	}

	// util-linux `script -qc "<cmd>" /dev/null` allocates a pty and runs
	// <cmd> attached to its slave side, discarding the typescript log.
	var ptyShell = child_process.spawn(scriptBin, ['-qc', '/bin/sh -i', '/dev/null'], {
		env: env,
		cwd: cwd
	});
	var settled = false;
	var pending = [];

	function bufferChunk (chunk) {
		pending.push(chunk);
	}

	ptyShell.stdout.on('data', bufferChunk);

	function stopBuffering () {
		ptyShell.stdout.removeListener('data', bufferChunk);
	}

	ptyShell.once('error', function () {
		if (settled) {
			return;
		}

		settled = true;
		stopBuffering();
		onReady(spawnPipedShell(env, cwd), false, []);
	});

	// This TV's `script` binary appears to need a controlling terminal to
	// bridge the pty; the service runs headless with none, so instead of
	// erroring it just hangs producing no output at all. Give the PTY
	// attempt a window to actually emit something; if nothing arrives,
	// assume it's stuck, kill it, and fall back to the piped shell (which
	// works fine without a tty).
	setTimeout(function () {
		if (settled) {
			return;
		}

		settled = true;
		stopBuffering();

		if (pending.length) {
			onReady(ptyShell, true, pending);
		} else {
			ptyShell.kill('SIGKILL');
			onReady(spawnPipedShell(env, cwd), false, []);
		}
	}, 800);
}

service.register('open', function (message) {
	var payload = message.payload || {};
	var cols = payload.cols || 80;
	var rows = payload.rows || 24;
	var sessionId = makeSessionId();
	var cwd = process.env.HOME || '/tmp';

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

	spawnInteractiveShell(env, cwd, function (shell, usingPty, pendingStdout) {
		startSession(shell, usingPty, pendingStdout);
	});

	function startSession (shell, usingPty, pendingStdout) {
	sessions[sessionId] = {
		shell: shell,
		cols: cols,
		rows: rows,
		usingPty: usingPty
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
	message.respond({returnValue: true});
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