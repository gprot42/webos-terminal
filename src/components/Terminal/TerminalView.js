import {Component} from 'react';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import Button from '@enact/limestone/Button';
import Spottable from '@enact/spotlight/Spottable';

import ShellSession from '../../services/ShellSession';
import {registerAppCleanup} from '../../utils/closeApp';
import {
	bindKeyboardVisibility,
	detachTerminalTextarea,
	focusInputElement,
	isKeyboardVisible,
	isWebOSTV,
	mapKeyDownToTerminal,
	pauseSpotlightForKeyboard,
	resumeSpotlightForKeyboard,
	syncProxyInputDelta
} from '../../utils/keyboard';
import {clampFontSize, clampTerminalRows, KEYBOARD_MODES} from '../../utils/settings';

import css from './Terminal.module.less';
import '@xterm/xterm/css/xterm.css';

const TerminalFocusRegion = Spottable('div');

class TerminalView extends Component {
	constructor (props) {
		super(props);
		this.containerRef = null;
		this.proxyInputRef = null;
		this.term = null;
		this.fitAddon = null;
		this.session = null;
		this.resizeObserver = null;
		this.unbindKeyboardVisibility = null;

		this.fitFrame = null;
		this.proxyInputFrame = null;
		this.proxyInputLength = 0;
		this.proxyPollInterval = null;
		this.initialized = false;
		this.useWebOSKeyboard = isWebOSTV();
		this.state = {
			initError: null
		};
	}

	componentDidMount () {
		this.tryInitTerminal();
	}

	componentDidUpdate (prevProps) {
		if (prevProps.settings?.keyboardMode !== this.props.settings?.keyboardMode) {
			this.applyKeyboardMode();
		}

		if (prevProps.settings?.terminalRows !== this.props.settings?.terminalRows) {
			this.applyTerminalSize();
		}

		if (prevProps.settings?.fontSize !== this.props.settings?.fontSize) {
			this.applyFontSize();
		}
	}

	setContainerRef = (node) => {
		this.containerRef = node;

		if (node && !this.initialized) {
			this.tryInitTerminal();
		}
	};

	setProxyInputRef = (node) => {
		this.proxyInputRef = node;
	};

	tryInitTerminal () {
		if (this.initialized || !this.containerRef) {
			return;
		}

		try {
			this.term = new Terminal({
				cursorBlink: true,
				convertEol: true,
				fontSize: this.getConfiguredFontSize(),
				fontFamily: 'Menlo, Monaco, "Courier New", monospace',
				theme: {
					background: '#1a1a1a',
					foreground: '#f0f0f0',
					cursor: '#f0f0f0',
					selectionBackground: '#4a4a4a'
				},
				scrollback: 5000,
				disableStdin: this.useWebOSKeyboard
			});

			this.fitAddon = new FitAddon();
			this.term.loadAddon(this.fitAddon);
			this.term.open(this.containerRef);
			detachTerminalTextarea(this.term);
			this.unbindKeyboardVisibility = bindKeyboardVisibility(
				this.handleKeyboardVisible,
				this.handleKeyboardHidden
			);

			this.applyTerminalSize();

			registerAppCleanup(() => {
				this.session?.close();
				this.term?.dispose();
			});

			this.session = new ShellSession({
				cols: this.term.cols,
				rows: this.term.rows,
				localEcho: !this.useWebOSKeyboard,
				onData: (data) => this.term.write(data),
				onExit: (code) => {
					this.term.writeln(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m`);
				},
				onError: (message) => {
					this.term.writeln(`\r\n\x1b[33m${message}\x1b[0m`);
				}
			});

			if (!this.useWebOSKeyboard) {
				this.term.onData((data) => {
					this.session.write(data);
				});
			}

			this.term.onResize(({cols, rows}) => {
				this.session.resize(cols, rows);
			});

			if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'function') {
				this.resizeObserver = new window.ResizeObserver(() => {
					this.scheduleFit();
				});
				this.resizeObserver.observe(this.containerRef);
			}

			this.initialized = true;
			this.applyKeyboardMode();
		} catch (err) {
			this.setState({
				initError: err?.message || 'Failed to start terminal'
			});
		}
	}

	getConfiguredRows () {
		return clampTerminalRows(this.props.settings?.terminalRows);
	}

	getConfiguredFontSize () {
		return clampFontSize(this.props.settings?.fontSize);
	}

	applyFontSize () {
		if (!this.term) {
			return;
		}

		const fontSize = this.getConfiguredFontSize();

		if (this.term.options.fontSize !== fontSize) {
			this.term.options.fontSize = fontSize;
			this.applyTerminalSize();
		}
	}

	shouldUseOnScreenKeyboard () {
		return this.useWebOSKeyboard &&
			this.props.settings?.keyboardMode !== KEYBOARD_MODES.PHYSICAL;
	}

	applyTerminalSize () {
		if (!this.term || !this.fitAddon || !this.containerRef) {
			return;
		}

		this.fitAddon.fit();

		const rows = this.getConfiguredRows();

		if (this.term.rows !== rows) {
			this.term.resize(this.term.cols, rows);
		}

		this.term.scrollToBottom();
	}

	scheduleFit () {
		if (isKeyboardVisible()) {
			return;
		}

		if (this.fitFrame) {
			return;
		}

		this.fitFrame = window.requestAnimationFrame(() => {
			this.fitFrame = null;
			this.applyTerminalSize();
		});
	}

	echoLocalInput (data) {
		if (!this.term || !data) {
			return;
		}

		for (const char of data) {
			if (char === '\u007F' || char === '\b') {
				this.term.write('\b \b');
			} else if (char === '\r' || char === '\n') {
				this.term.write('\r\n');
			} else {
				this.term.write(char);
			}
		}
	}

	sendToTerminal (data) {
		if (!data || !this.session) {
			return;
		}

		if (this.useWebOSKeyboard) {
			this.echoLocalInput(data);
		}

		this.session.write(data);
	}

	flushProxyInput () {
		const {length, delta} = syncProxyInputDelta(
			this.proxyInputRef,
			this.proxyInputLength
		);

		this.proxyInputLength = length;

		if (!delta) {
			return;
		}

		// The on-screen keyboard's Enter key inserts a newline into the field.
		// Treat that as a line submit: forward as a carriage return and reset the
		// field so the next command starts clean.
		if (/[\r\n]/.test(delta)) {
			this.sendToTerminal(delta.replace(/\r?\n/g, '\r'));

			if (this.proxyInputRef) {
				this.proxyInputRef.value = '';
			}

			this.proxyInputLength = 0;
			return;
		}

		this.sendToTerminal(delta);
	}

	handleProxyInput = () => {
		if (this.proxyInputFrame) {
			return;
		}

		this.proxyInputFrame = window.requestAnimationFrame(() => {
			this.proxyInputFrame = null;
			this.flushProxyInput();
		});
	};

	handleCompositionEnd = (event) => {
		if (event?.data) {
			this.sendToTerminal(event.data);
		}

		if (this.proxyInputRef) {
			this.proxyInputLength = this.proxyInputRef.value.length;
		}
	};

	handleKeyboardVisible = () => {
		// Pause Spotlight for the whole VKB session. Without this, Spotlight moves
		// focus back onto the terminal region, blurs the proxy input, and the VKB
		// closes again after ~1s (flicker). Pausing does NOT block the system VKB's
		// own keys -- the IME owns them.
		pauseSpotlightForKeyboard();
		this.startProxyInputPoll();
	};

	submitProxyLine = () => {
		this.sendToTerminal('\r');

		if (this.proxyInputRef) {
			this.proxyInputRef.value = '';
		}

		this.proxyInputLength = 0;
	};

	handleProxyKeyDown = (event) => {
		// While the system VKB is open, let webOS fully own every key: navigation
		// (arrows) so the highlight can reach the ENG/umlaut column, OK/select so
		// those keys activate, and Enter/accents. We must NOT preventDefault or
		// stopPropagation here -- doing so blocks the VKB's own key handling. The
		// input poll captures the resulting text, backspaces, and newline-submit.
		// Spotlight is paused for the VKB session, so it won't act on these keys.
		if (isKeyboardVisible()) {
			return;
		}

		const code = event.keyCode || event.which;

		if (code === 13) {
			event.preventDefault();
			this.submitProxyLine();
			return;
		}

		const data = mapKeyDownToTerminal(event);

		if (!data) {
			return;
		}

		event.preventDefault();
		this.sendToTerminal(data);

		if (code === 8 && this.proxyInputRef?.value) {
			this.proxyInputRef.value = this.proxyInputRef.value.slice(0, -1);
			this.proxyInputLength = this.proxyInputRef.value.length;
		}
	};

	startProxyInputPoll () {
		this.stopProxyInputPoll();
		this.proxyPollInterval = window.setInterval(() => {
			this.flushProxyInput();
		}, 100);
	}

	stopProxyInputPoll () {
		if (this.proxyPollInterval) {
			window.clearInterval(this.proxyPollInterval);
			this.proxyPollInterval = null;
		}
	}

	applyKeyboardMode () {
		// Keyboard opens when the user selects the terminal; do not steal focus on load.
	}

	activateTerminalInput = (fromUserGesture = false) => {
		if (this.shouldUseOnScreenKeyboard()) {
			// Focus once per activation; avoid refocusing while navigating the system VKB.
			if (document.activeElement !== this.proxyInputRef) {
				focusInputElement(this.proxyInputRef, {fromUserGesture});
			}
			return;
		}

		this.term?.focus();
		this.term?.textarea?.focus();
	};

	handleTerminalRegionActivate = (event) => {
		// While the system VKB is up, its ENG (language) list and umlaut/accent
		// popups render in the app area above the keyboard. Swallowing the pointer
		// event here blocks those clicks (webOS shows the red "blocked" pointer and
		// nothing happens), so let the VKB fully own pointer input while it is open.
		if (isKeyboardVisible()) {
			return;
		}

		event?.preventDefault?.();
		event?.stopPropagation?.();
		this.activateTerminalInput(true);
	};

	handleProxyFocus = () => {
		// Keep Spotlight paused while the proxy holds focus so it cannot steal
		// focus back and close the VKB.
		pauseSpotlightForKeyboard();
	};

	handleProxyBlur = () => {
		// The VKB can blur the proxy while still open (e.g. navigating its left
		// column). Only resume Spotlight once the keyboard is actually hidden.
		if (!isKeyboardVisible()) {
			resumeSpotlightForKeyboard();
		}
	};

	handleShowKeyboard = () => {
		this.activateTerminalInput(true);
	};

	handleKeyboardHidden = () => {
		resumeSpotlightForKeyboard();
		this.stopProxyInputPoll();
		this.scheduleFit();
	};

	componentWillUnmount () {
		if (this.fitFrame) {
			window.cancelAnimationFrame(this.fitFrame);
			this.fitFrame = null;
		}

		if (this.proxyInputFrame) {
			window.cancelAnimationFrame(this.proxyInputFrame);
			this.proxyInputFrame = null;
		}

		this.stopProxyInputPoll();
		this.unbindKeyboardVisibility?.();
		resumeSpotlightForKeyboard();
		this.resizeObserver?.disconnect();
		this.session?.close();
		this.term?.dispose();
	}

	render () {
		const {initError} = this.state;
		const showKeyboardButton =
			this.props.settings?.keyboardMode === KEYBOARD_MODES.MANUAL;

		if (initError) {
			return (
				<div className={css.wrapper}>
					<div className={css.error}>
						{initError}
					</div>
				</div>
			);
		}

		return (
			<div className={css.wrapper}>
				{showKeyboardButton ? (
					<div className={css.toolbar}>
						<Button onClick={this.handleShowKeyboard} size="small">
							Show Keyboard
						</Button>
					</div>
				) : null}
				<TerminalFocusRegion
					aria-label="Terminal output area"
					className={css.focusRegion}
					onClick={this.handleTerminalRegionActivate}
					onMouseDown={this.handleTerminalRegionActivate}
					role="presentation"
					spotlightId="terminal-focus-region"
				>
					<div
						className={css.terminal}
						ref={this.setContainerRef}
					/>
				</TerminalFocusRegion>
				{this.shouldUseOnScreenKeyboard() ? (
					<textarea
						aria-label="Terminal keyboard input"
						autoCapitalize="off"
						autoComplete="off"
						autoCorrect="off"
						className={css.hiddenProxy}
						inputMode="text"
						onBlur={this.handleProxyBlur}
						onChange={this.handleProxyInput}
						onCompositionEnd={this.handleCompositionEnd}
						onFocus={this.handleProxyFocus}
						onInput={this.handleProxyInput}
						onKeyDown={this.handleProxyKeyDown}
						ref={this.setProxyInputRef}
						rows={1}
						spellCheck={false}
						tabIndex={0}
					/>
				) : null}
			</div>
		);
	}
}

export default TerminalView;