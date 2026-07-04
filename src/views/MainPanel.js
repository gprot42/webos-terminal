import {Component} from 'react';
import Button from '@enact/limestone/Button';
import {Panel, Header} from '@enact/limestone/Panels';

import TerminalView from '../components/Terminal/TerminalView';

import css from './MainPanel.module.less';

const MAX_TABS = 8;

let nextTabId = 1;

function createTab () {
	const id = String(nextTabId++);

	return {
		id,
		title: `Tab ${id}`
	};
}

class MainPanel extends Component {
	constructor (props) {
		super(props);

		const firstTab = createTab();

		this.state = {
			tabs: [firstTab],
			activeTabId: firstTab.id
		};
	}

	selectTab = (tabId) => {
		if (tabId !== this.state.activeTabId) {
			this.setState({activeTabId: tabId});
		}
	};

	addTab = () => {
		this.setState((prev) => {
			if (prev.tabs.length >= MAX_TABS) {
				return null;
			}

			const tab = createTab();

			return {
				tabs: [...prev.tabs, tab],
				activeTabId: tab.id
			};
		});
	};

	closeTab = (tabId) => {
		this.setState((prev) => {
			if (prev.tabs.length <= 1) {
				return null;
			}

			const index = prev.tabs.findIndex((tab) => tab.id === tabId);

			if (index === -1) {
				return null;
			}

			const tabs = prev.tabs.filter((tab) => tab.id !== tabId);
			let {activeTabId} = prev;

			if (activeTabId === tabId) {
				const nextIndex = Math.min(index, tabs.length - 1);
				activeTabId = tabs[nextIndex].id;
			}

			return {tabs, activeTabId};
		});
	};

	handleTabClick = (event) => {
		const tabId = event.currentTarget.dataset.tabId;

		if (tabId) {
			this.selectTab(tabId);
		}
	};

	handleTabClose = (event) => {
		const tabId = event.currentTarget.dataset.tabId;

		if (tabId) {
			this.closeTab(tabId);
		}
	};

	render () {
		const {onOpenSettings, settings} = this.props;
		const {tabs, activeTabId} = this.state;
		const atTabLimit = tabs.length >= MAX_TABS;

		return (
			<Panel className={css.panel}>
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
				<div className={css.body}>
					<div className={css.tabBar}>
						<div className={css.tabList}>
							{tabs.map((tab) => (
								<div className={css.tabItem} key={tab.id}>
									<Button
										aria-label={`Switch to ${tab.title}`}
										className={activeTabId === tab.id ? css.tabSelected : css.tab}
										data-tab-id={tab.id}
										onClick={this.handleTabClick}
										size="small"
									>
										{tab.title}
									</Button>
									{tabs.length > 1 ? (
										<Button
											aria-label={`Close ${tab.title}`}
											className={css.tabClose}
											data-tab-id={tab.id}
											icon="closex"
											onClick={this.handleTabClose}
											size="small"
										/>
									) : null}
								</div>
							))}
						</div>
						<Button
							aria-label="New tab"
							className={css.tabAdd}
							disabled={atTabLimit}
							icon="plus"
							onClick={this.addTab}
							size="small"
						/>
					</div>
					<div className={css.tabContent}>
						{tabs.map((tab) => (
							<div
								className={activeTabId === tab.id ? css.tabPaneActive : css.tabPane}
								key={tab.id}
							>
								<TerminalView
									active={activeTabId === tab.id}
									settings={settings}
									tabId={tab.id}
								/>
							</div>
						))}
					</div>
				</div>
			</Panel>
		);
	}
}

export default MainPanel;