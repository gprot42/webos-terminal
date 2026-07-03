var child_process = require('child_process');
var crypto = require('crypto');
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

service.register('open', function (message) {
	var payload = message.payload || {};
	var cols = payload.cols || 80;
	var rows = payload.rows || 24;
	var sessionId = makeSessionId();

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

	// The service jail has no PTY devices, so use a piped shell and strip the
	// harmless job-control warning from its startup output.
	var shell = child_process.spawn('/bin/sh', ['-i'], {
		env: env,
		cwd: process.env.HOME || '/tmp'
	});

	sessions[sessionId] = {
		shell: shell,
		cols: cols,
		rows: rows
	};

	message.respond({
		returnValue: true,
		sessionId: sessionId,
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