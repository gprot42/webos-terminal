import {Component} from 'react';
import ThemeDecorator from '@enact/limestone/ThemeDecorator';
import Panels from '@enact/limestone/Panels';
import {fetchAppInfo} from '@enact/webos/application';

import {closeApp} from '../utils/closeApp';
import {defaultSettings, loadSettings, saveSettings} from '../utils/settings';
import {VERSION} from '../version';
import MainPanel from '../views/MainPanel';
import SettingsPanel from '../views/SettingsPanel';

import './attachErrorHandler';

import css from './App.module.less';

class App extends Component {
	constructor (props) {
		super(props);

		this.state = {
			panelIndex: 0,
			settings: loadSettings(),
			appVersion: VERSION
		};
	}

	componentDidMount () {
		fetchAppInfo((info) => {
			const appVersion = info?.version || VERSION;

			if (appVersion !== this.state.appVersion) {
				this.setState({appVersion});
			}
		});
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
		const {panelIndex, settings, appVersion} = this.state;

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
					appVersion={appVersion}
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