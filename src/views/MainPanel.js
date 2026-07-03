import kind from '@enact/core/kind';
import Button from '@enact/limestone/Button';
import {Panel, Header} from '@enact/limestone/Panels';

import TerminalView from '../components/Terminal/TerminalView';

import css from './MainPanel.module.less';

const MainPanel = kind({
	name: 'MainPanel',

	styles: {
		css,
		className: 'panel'
	},

	render: ({onOpenSettings, settings, ...rest}) => (
		<Panel {...rest}>
			<Header
				title="Terminal"
				subtitle="Interactive shell for webOS"
				slotAfter={(
					<Button
						aria-label="Settings"
						icon="gear"
						onClick={onOpenSettings}
						size="small"
					/>
				)}
			/>
			<TerminalView settings={settings} />
		</Panel>
	)
});

export default MainPanel;