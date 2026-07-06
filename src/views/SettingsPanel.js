import kind from '@enact/core/kind';
import BodyText from '@enact/limestone/BodyText';
import {Panel, Header} from '@enact/limestone/Panels';
import Dropdown from '@enact/limestone/Dropdown';

import {
	DEFAULT_AUTOMATION_PASSWORD,
	FONT_SIZE_OPTIONS,
	KEYBOARD_MODES,
	TERMINAL_ROW_OPTIONS
} from '../utils/settings';
import css from './SettingsPanel.module.less';

const KEYBOARD_MODE_VALUES = [KEYBOARD_MODES.AUTO, KEYBOARD_MODES.MANUAL, KEYBOARD_MODES.PHYSICAL];
const KEYBOARD_MODE_LABELS = [
	'On-screen keyboard (automatic)',
	'On-screen keyboard (manual)',
	'Physical keyboard only'
];

const ROW_LABELS = TERMINAL_ROW_OPTIONS.map((rows) => `${rows} rows`);
const FONT_SIZE_LABELS = FONT_SIZE_OPTIONS.map((size) => `${size} px`);

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
		onSelectKeyboardMode: (ev, {onSettingsChange}) => {
			onSettingsChange?.({keyboardMode: KEYBOARD_MODE_VALUES[ev.selected]});
		},
		onAutomationPasswordChange: (ev, {onSettingsChange}) => {
			onSettingsChange?.({automationPassword: ev.target.value});
		}
	},

	computed: {
		rowsSelected: ({settings}) => TERMINAL_ROW_OPTIONS.indexOf(settings.terminalRows),
		fontSizeSelected: ({settings}) => FONT_SIZE_OPTIONS.indexOf(settings.fontSize),
		keyboardModeSelected: ({settings}) => KEYBOARD_MODE_VALUES.indexOf(settings.keyboardMode)
	},

	render: ({
		appVersion,
		rowsSelected,
		fontSizeSelected,
		keyboardModeSelected,
		onSelectRows,
		onSelectFontSize,
		onSelectKeyboardMode,
		onAutomationPasswordChange,
		settings, // eslint-disable-line no-unused-vars
		onSettingsChange, // eslint-disable-line no-unused-vars
		...rest
	}) => (
		<Panel {...rest}>
			<Header title="Settings" subtitle="Keyboard, input, and display" noCloseButton />
			<div className={css.body}>
				<div className={css.content}>
					<div className={css.row}>
						<div className={css.field}>
							<Dropdown
								title="Terminal rows"
								selected={rowsSelected}
								onSelect={onSelectRows}
								width="small"
							>
								{ROW_LABELS}
							</Dropdown>
							<BodyText className={css.help} size="small">
								Number of visible terminal lines. Width still adjusts to the
								screen; only the row count is fixed.
							</BodyText>
						</div>
						<div className={css.field}>
							<Dropdown
								title="Font size"
								selected={fontSizeSelected}
								onSelect={onSelectFontSize}
								width="small"
							>
								{FONT_SIZE_LABELS}
							</Dropdown>
							<BodyText className={css.help} size="small">
								Terminal text size. Larger text shows fewer characters per line.
							</BodyText>
						</div>
						<div className={css.field}>
							<Dropdown
								title="Keyboard input"
								selected={keyboardModeSelected}
								onSelect={onSelectKeyboardMode}
								width="large"
							>
								{KEYBOARD_MODE_LABELS}
							</Dropdown>
							<BodyText className={css.help} size="small">
								Tap the terminal area to open the on-screen keyboard. Use ENG on
								the keyboard (left column, above the umlaut key) to switch
								languages.
							</BodyText>
							<BodyText className={css.help} size="small">
								Phone remote: the LG ThinQ / Screen Remote app can also type into
								the on-screen keyboard while it is open. USB or Bluetooth
								keyboards work automatically; webOS hides the on-screen keyboard
								when physical keys are pressed.
							</BodyText>
						</div>
					</div>
					<div className={css.row}>
						<div className={css.field}>
							<label className={css.label} htmlFor="automation-password">
								SSH automation password
							</label>
							<input
								autoCapitalize="off"
								autoComplete="off"
								autoCorrect="off"
								className={css.textInput}
								id="automation-password"
								onChange={onAutomationPasswordChange}
								spellCheck={false}
								type="text"
								value={settings.automationPassword || DEFAULT_AUTOMATION_PASSWORD}
							/>
							<BodyText className={css.help} size="small">
								Required for SSH luna-send run/listSessions. Default is
								{' '}
								{DEFAULT_AUTOMATION_PASSWORD}
								.
							</BodyText>
						</div>
					</div>
				</div>
				<BodyText className={css.version} size="small">
					{`Version ${appVersion}`}
				</BodyText>
			</div>
		</Panel>
	)
});

export default SettingsPanel;
