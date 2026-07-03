import kind from '@enact/core/kind';
import {Panel, Header} from '@enact/limestone/Panels';
import RadioItem from '@enact/limestone/RadioItem';
import Item from '@enact/limestone/Item';

import {KEYBOARD_MODES, TERMINAL_ROW_OPTIONS} from '../utils/settings';

import css from './SettingsPanel.module.less';

const SettingsPanel = kind({
	name: 'SettingsPanel',

	propTypes: {
		onSettingsChange: function () {}
	},

	styles: {
		css,
		className: 'panel'
	},

	handlers: {
		onSelectAuto: (ev, {onSettingsChange}) => {
			onSettingsChange?.({keyboardMode: KEYBOARD_MODES.AUTO});
		},
		onSelectManual: (ev, {onSettingsChange}) => {
			onSettingsChange?.({keyboardMode: KEYBOARD_MODES.MANUAL});
		},
		onSelectPhysical: (ev, {onSettingsChange}) => {
			onSettingsChange?.({keyboardMode: KEYBOARD_MODES.PHYSICAL});
		},
		onSelectTerminalRows: (ev, {onSettingsChange, rows}) => {
			onSettingsChange?.({terminalRows: rows});
		}
	},

	render: ({settings, onSelectAuto, onSelectManual, onSelectPhysical, onSelectTerminalRows, ...rest}) => (
		<Panel {...rest}>
			<Header title="Settings" subtitle="Keyboard, input, and display" noCloseButton />
			<div className={css.content}>
				<Item className={css.sectionLabel} label="Terminal rows" />
				{TERMINAL_ROW_OPTIONS.map((rows) => (
					<RadioItem
						key={rows}
						onToggle={onSelectTerminalRows}
						rows={rows}
						selected={settings.terminalRows === rows}
					>
						{rows} rows
					</RadioItem>
				))}
				<Item
					className={css.help}
					label="Number of visible terminal lines. Width still adjusts to the screen; only the row count is fixed."
				/>
				<Item className={css.sectionLabel} label="Keyboard input" />
				<RadioItem
					selected={settings.keyboardMode === KEYBOARD_MODES.AUTO}
					onToggle={onSelectAuto}
				>
					On-screen keyboard (automatic)
				</RadioItem>
				<RadioItem
					selected={settings.keyboardMode === KEYBOARD_MODES.MANUAL}
					onToggle={onSelectManual}
				>
					On-screen keyboard (manual)
				</RadioItem>
				<RadioItem
					selected={settings.keyboardMode === KEYBOARD_MODES.PHYSICAL}
					onToggle={onSelectPhysical}
				>
					Physical keyboard only
				</RadioItem>
				<Item
					className={css.help}
					label="Tap the terminal area to open the on-screen keyboard. Use ENG on the keyboard (left column, above the umlaut key) to switch languages."
				/>
				<Item
					className={css.help}
					label="Phone remote: the LG ThinQ / Screen Remote app can also type into the on-screen keyboard while it is open."
				/>
				<Item
					className={css.help}
					label="USB or Bluetooth keyboards work automatically. webOS hides the on-screen keyboard when physical keys are pressed."
				/>
			</div>
		</Panel>
	)
});

export default SettingsPanel;