import {Component} from 'react';
import Button from '@enact/limestone/Button';
import {Panel, Header} from '@enact/limestone/Panels';

import TerminalView from '../components/Terminal/TerminalView';
import {loadTabState, saveTabState, saveTabStateNow} from '../utils/tabPersistence';

import css from './MainPanel.module.less';

const MAX_TABS = 8;

let nextTabId = 1;

function createTab (cwd) {
	const id = String(nextTabId++);

	return {
		id,
		title: `Tab ${id}`,
		cwd
	};
}

class MainPanel extends Component {
	constructor (props) {
		super(props);

		const persisted = loadTabState();

		if (persisted?.tabs?.length) {
			const tabs = persisted.tabs.map((tab) => createTab(tab.cwd));
			const activeIndex = persisted.tabs.findIndex((tab) => tab.id === persisted.activeTabId);
			const activeTabId = tabs[activeIndex === -1 ? 0 : activeIndex].id;

			this.state = {tabs, activeTabId};
		} else {
			const firstTab = createTab();

			this.state = {
				tabs: [firstTab],
				activeTabId: firstTab.id
			};
		}
	}

	componentDidUpdate () {
		this.persistTabs();
	}

	componentWillUnmount () {
		this.persistTabs(true);
	}

	persistTabs (immediate = false) {
		const {tabs, activeTabId} = this.state;
		const state = {
			tabs: tabs.map((tab) => ({id: tab.id, cwd: tab.cwd})),
			activeTabId
		};

		if (immediate) {
			saveTabStateNow(state);
		} else {
			saveTabState(state);
		}
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

	handleCwdChange = (tabId, cwd) => {
		this.setState((prev) => {
			const tabs = prev.tabs.map((tab) => (tab.id === tabId ? {...tab, cwd} : tab));

			return {tabs};
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
									initialCwd={tab.cwd}
									onCwdChange={(cwd) => this.handleCwdChange(tab.id, cwd)}
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