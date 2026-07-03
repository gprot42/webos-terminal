import kind from '@enact/core/kind';
import BodyText from '@enact/limestone/BodyText';
import Heading from '@enact/limestone/Heading';
import {Panel, Header} from '@enact/limestone/Panels';
import RadioItem from '@enact/limestone/RadioItem';

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
		}
	},

	render: ({settings, onSettingsChange, onSelectAuto, onSelectManual, onSelectPhysical, ...rest}) => (
		<Panel {...rest}>
			<Header title="Settings" subtitle="Keyboard, input, and display" noCloseButton />
			<div className={css.content}>
				<div className={css.column}>
					<Heading size="small" showLine>Terminal rows</Heading>
					<div className={css.rowGrid}>
						{TERMINAL_ROW_OPTIONS.map((rows) => (
							<RadioItem
								className={css.rowOption}
								key={rows}
								onToggle={() => onSettingsChange?.({terminalRows: rows})}
								selected={settings.terminalRows === rows}
							>
								{`${rows} rows`}
							</RadioItem>
						))}
					</div>
					<BodyText className={css.help} size="small">
						Number of visible terminal lines. Width still adjusts to the
						screen; only the row count is fixed.
					</BodyText>
				</div>
				<div className={css.column}>
					<Heading size="small" showLine>Keyboard input</Heading>
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
		</Panel>
	)
});

export default SettingsPanel;
