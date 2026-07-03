import {Component} from 'react';
import ThemeDecorator from '@enact/limestone/ThemeDecorator';
import Panels from '@enact/limestone/Panels';

import {closeApp} from '../utils/closeApp';
import {defaultSettings, loadSettings, saveSettings} from '../utils/settings';
import MainPanel from '../views/MainPanel';
import SettingsPanel from '../views/SettingsPanel';

import './attachErrorHandler';

import css from './App.module.less';

class App extends Component {
	constructor (props) {
		super(props);

		this.state = {
			panelIndex: 0,
			settings: loadSettings()
		};
	}

	handleOpenSettings = () => {
		this.setState({panelIndex: 1});
	};

	handleBack = () => {
		this.setState({panelIndex: 0});
	};

	handleSettingsChange = (patch) => {
		this.setState((prev) => {
			const settings = {...prev.settings, ...patch};
			saveSettings(settings);
			return {settings};
		});
	};

	render () {
		const {panelIndex, settings} = this.state;

		return (
			<Panels
				className={css.app}
				index={panelIndex}
				noCloseButton={panelIndex > 0}
				onBack={panelIndex > 0 ? this.handleBack : undefined}
				onClose={closeApp}
			>
				<MainPanel
					onOpenSettings={this.handleOpenSettings}
					settings={settings}
				/>
				<SettingsPanel
					onSettingsChange={this.handleSettingsChange}
					settings={settings}
				/>
			</Panels>
		);
	}
}

App.defaultProps = {
	settings: defaultSettings
};

export default ThemeDecorator(App);