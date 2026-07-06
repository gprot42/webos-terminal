import kind from '@enact/core/kind';
import BodyText from '@enact/limestone/BodyText';
import {Panel, Header} from '@enact/limestone/Panels';
import Dropdown from '@enact/limestone/Dropdown';

import {
	focusInputElement,
	isKeyboardVisible,
	pauseSpotlightForKeyboard,
	resumeSpotlightForKeyboard
} from '../utils/keyboard';
import {
	DEFAULT_AUTOMATION_PASSWORD,
	FONT_FAMILY_OPTIONS,
	FONT_SIZE_OPTIONS,
	KEYBOARD_MODES,
	TERMINAL_ROW_OPTIONS
} from '../utils/settings';
import {
	describeFontSelection,
	FONT_PREVIEW_GLYPH_GROUPS,
	FONT_PREVIEW_TERMINAL_LINES,
	getFontFamilyOption,
	getFontPreviewFamily
} from '../utils/fonts';
import css from './SettingsPanel.module.less';

const KEYBOARD_MODE_VALUES = [KEYBOARD_MODES.AUTO, KEYBOARD_MODES.MANUAL, KEYBOARD_MODES.PHYSICAL];
const KEYBOARD_MODE_LABELS = [
	'On-screen keyboard (automatic)',
	'On-screen keyboard (manual)',
	'Physical keyboard only'
];

const ROW_LABELS = TERMINAL_ROW_OPTIONS.map((rows) => `${rows} rows`);
const FONT_SIZE_LABELS = FONT_SIZE_OPTIONS.map((size) => `${size} px`);
const FONT_FAMILY_LABELS = FONT_FAMILY_OPTIONS.map((option) => option.label);

const SettingsPanel = kind({
	name: 'SettingsPanel',

	propTypes: {
		appVersion: function () {},
		onSettingsChange: function () {}
	},

	defaultProps: {
		appVersion: ''
	},

	styles: {
		css,
		className: 'panel'
	},

	handlers: {
		onSelectRows: (ev, {onSettingsChange}) => {
			onSettingsChange?.({terminalRows: TERMINAL_ROW_OPTIONS[ev.selected]});
		},
		onSelectFontSize: (ev, {onSettingsChange}) => {
			onSettingsChange?.({fontSize: FONT_SIZE_OPTIONS[ev.selected]});
		},
		onSelectFontFamily: (ev, {onSettingsChange}) => {
			onSettingsChange?.({fontFamily: FONT_FAMILY_OPTIONS[ev.selected].id});
		},
		onSelectKeyboardMode: (ev, {onSettingsChange}) => {
			onSettingsChange?.({keyboardMode: KEYBOARD_MODE_VALUES[ev.selected]});
		},
		onAutomationPasswordChange: (ev, {onSettingsChange}) => {
			onSettingsChange?.({automationPassword: ev.target.value});
		},
		onPasswordFocus: () => {
			pauseSpotlightForKeyboard();
		},
		onPasswordBlur: () => {
			if (!isKeyboardVisible()) {
				resumeSpotlightForKeyboard();
			}
		},
		onPasswordActivate: (ev) => {
			focusInputElement(ev.currentTarget, {fromUserGesture: true});
		}
	},

	computed: {
		rowsSelected: ({settings}) => TERMINAL_ROW_OPTIONS.indexOf(settings.terminalRows),
		fontSizeSelected: ({settings}) => FONT_SIZE_OPTIONS.indexOf(settings.fontSize),
		fontFamilySelected: ({settings}) => {
			const index = FONT_FAMILY_OPTIONS.findIndex((option) => option.id === settings.fontFamily);

			return index >= 0 ? index : 0;
		},
		keyboardModeSelected: ({settings}) => KEYBOARD_MODE_VALUES.indexOf(settings.keyboardMode),
		fontPreviewFamily: ({settings}) => getFontPreviewFamily(settings.fontFamily),
		fontPreviewLabel: ({settings}) => getFontFamilyOption(settings.fontFamily).label,
		fontPreviewStatus: ({settings}) => describeFontSelection(settings.fontFamily)
	},

	render: ({
		appVersion,
		rowsSelected,
		fontSizeSelected,
		fontFamilySelected,
		fontPreviewFamily,
		fontPreviewLabel,
		fontPreviewStatus,
		keyboardModeSelected,
		onSelectRows,
		onSelectFontSize,
		onSelectFontFamily,
		onSelectKeyboardMode,
		onAutomationPasswordChange,
		onPasswordFocus,
		onPasswordBlur,
		onPasswordActivate,
		settings, // eslint-disable-line no-unused-vars
		onSettingsChange, // eslint-disable-line no-unused-vars
		...rest
	}) => (
		<Panel {...rest}>
			<Header title="Settings" subtitle="Appearance, input, and access" noCloseButton />
			<div className={css.body}>
				<div className={css.content}>
					<section className={css.heroSection}>
						<div className={css.sectionIntro}>
							<h2 className={css.sectionTitle}>Typography</h2>
							<p className={css.sectionSubtitle}>
								Choose a monospace typeface tuned for terminal work
							</p>
						</div>

						<div
							aria-label="Font preview"
							className={css.fontPreview}
							style={{fontFamily: fontPreviewFamily}}
						>
							<div className={css.fontPreviewHeader}>
								<span className={css.fontPreviewAa}>Aa</span>
								<div className={css.fontPreviewMeta}>
									<span className={css.fontPreviewName}>{fontPreviewLabel}</span>
									<span className={css.fontPreviewHint}>{fontPreviewStatus}</span>
								</div>
							</div>
							<div className={css.glyphRow}>
								{FONT_PREVIEW_GLYPH_GROUPS.map((group) => (
									<div className={css.glyphChip} key={group.label}>
										<span className={css.glyphLabel}>{group.label}</span>
										<span className={css.glyphChars}>{group.chars}</span>
									</div>
								))}
							</div>
							<div className={css.terminalSample}>
								{FONT_PREVIEW_TERMINAL_LINES.map((line) => (
									<div className={css.terminalLine} key={line}>
										{line}
									</div>
								))}
							</div>
						</div>

						<div className={css.fontControl}>
							<Dropdown
								title="Typeface"
								selected={fontFamilySelected}
								onSelect={onSelectFontFamily}
								width="large"
							>
								{FONT_FAMILY_LABELS}
							</Dropdown>
						</div>
					</section>

					<section className={css.section}>
						<div className={css.sectionIntro}>
							<h2 className={css.sectionTitle}>Display</h2>
							<p className={css.sectionSubtitle}>
								Control how much text fits on screen
							</p>
						</div>
						<div className={css.cardRow}>
							<div className={css.card}>
								<Dropdown
									title="Font size"
									selected={fontSizeSelected}
									onSelect={onSelectFontSize}
									width="small"
								>
									{FONT_SIZE_LABELS}
								</Dropdown>
								<BodyText className={css.cardHelp} size="small">
									Larger text shows fewer characters per line.
								</BodyText>
							</div>
							<div className={css.card}>
								<Dropdown
									title="Terminal rows"
									selected={rowsSelected}
									onSelect={onSelectRows}
									width="small"
								>
									{ROW_LABELS}
								</Dropdown>
								<BodyText className={css.cardHelp} size="small">
									Fixed number of visible lines. Width still fits the screen.
								</BodyText>
							</div>
						</div>
					</section>

					<section className={css.section}>
						<div className={css.sectionIntro}>
							<h2 className={css.sectionTitle}>Input &amp; Access</h2>
							<p className={css.sectionSubtitle}>
								Keyboard behavior and SSH automation credentials
							</p>
						</div>
						<div className={css.inputStack}>
							<div className={css.card}>
								<Dropdown
									title="Keyboard input"
									selected={keyboardModeSelected}
									onSelect={onSelectKeyboardMode}
									width="large"
								>
									{KEYBOARD_MODE_LABELS}
								</Dropdown>
								<BodyText className={css.cardHelp} size="small">
									Tap the terminal to open the on-screen keyboard. Use ENG
									(left column) to switch languages.
								</BodyText>
								<BodyText className={css.cardHelp} size="small">
									Phone remote, USB, and Bluetooth keyboards also work. webOS
									hides the on-screen keyboard when physical keys are pressed.
								</BodyText>
							</div>
							<div className={css.card}>
								<label className={css.fieldLabel} htmlFor="automation-password">
									SSH automation password
								</label>
								<input
									autoCapitalize="off"
									autoComplete="off"
									autoCorrect="off"
									className={css.textInput}
									id="automation-password"
									maxLength={15}
									onBlur={onPasswordBlur}
									onChange={onAutomationPasswordChange}
									onFocus={onPasswordFocus}
									onMouseDown={onPasswordActivate}
									size={15}
									spellCheck={false}
									type="text"
									value={settings.automationPassword || DEFAULT_AUTOMATION_PASSWORD}
								/>
								<BodyText className={css.cardHelp} size="small">
									Required for SSH luna-send run/listSessions. Default is
									{' '}
									{DEFAULT_AUTOMATION_PASSWORD}
									.
								</BodyText>
							</div>
						</div>
					</section>
				</div>
				<BodyText className={css.version} size="small">
					{`Version ${appVersion}`}
				</BodyText>
			</div>
		</Panel>
	)
});

export default SettingsPanel;