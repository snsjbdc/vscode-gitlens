/*global document window*/
import type { GraphRefOptData } from '@gitkraken/gitkraken-components';
import { consume } from '@lit/context';
import { SignalWatcher } from '@lit-labs/signals';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import { html, LitElement, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { repeat } from 'lit/directives/repeat.js';
import { when } from 'lit/directives/when.js';
import type { ConnectCloudIntegrationsCommandArgs } from '../../../../commands/cloudIntegrations';
import type { BranchGitCommandArgs } from '../../../../commands/git/branch';
import type { GraphBranchesVisibility } from '../../../../config';
import { GlCommand } from '../../../../constants.commands';
import type { SearchQuery } from '../../../../constants.search';
import { isSubscriptionPaid } from '../../../../plus/gk/utils/subscription.utils';
import type { LaunchpadCommandArgs } from '../../../../plus/launchpad/launchpad';
import { createCommandLink } from '../../../../system/commands';
import { createWebviewCommandLink } from '../../../../system/webview';
import type {
	GraphExcludedRef,
	GraphExcludeTypes,
	GraphMinimapMarkerTypes,
	GraphSearchResults,
	GraphSearchResultsError,
	State,
} from '../../../plus/graph/protocol';
import {
	OpenPullRequestDetailsCommand,
	SearchOpenInViewCommand,
	UpdateExcludeTypesCommand,
	UpdateGraphConfigurationCommand,
	UpdateIncludedRefsCommand,
	UpdateRefsVisibilityCommand,
} from '../../../plus/graph/protocol';
import '../../shared/components/branch-icon';
import '../../shared/components/button';
import '../../shared/components/code-icon';
import type { CustomEventType } from '../../shared/components/element';
import '../../shared/components/menu';
import '../../shared/components/checkbox/checkbox';
import '../../shared/components/radio/radio-group';
import '../../shared/components/radio/radio';
import '../../shared/components/overlays/popover';
import '../../shared/components/search/search-box';
import '../../shared/components/overlays/tooltip';
import '../../shared/components/rich/issue-pull-request';
import type { SearchNavigationEventDetail } from '../../shared/components/search/search-input';
import { ipcContext } from '../../shared/context';
import { emitTelemetrySentEvent } from '../../shared/telemetry';
import '../shared/components/merge-rebase-status';
import './actions/gitActionsButtons.wc';
import { stateContext } from './context';
import './graph-wrapper';
import './graph.scss';
import graphStyles from './graph.scss?lit';
import type { GraphSearchingState } from './stateProvider';
import { graphSearchStateContext, graphStateContext } from './stateProvider';
import type { RadioGroup } from '../../shared/components/radio/radio-group';

function getSearchResultModel(state: GraphSearchingState['state']): {
	results: undefined | GraphSearchResults;
	resultsError: undefined | GraphSearchResultsError;
} {
	let results: undefined | GraphSearchResults;
	let resultsError: undefined | GraphSearchResultsError;
	if (state?.results != null) {
		if ('error' in state.results) {
			resultsError = state.results;
		} else {
			results = state.results;
		}
	}
	return { results: results, resultsError: resultsError };
}

function getRemoteIcon(type: number | string) {
	switch (type) {
		case 'head':
			return 'vm';
		case 'remote':
			return 'cloud';
		case 'tag':
			return 'tag';
		default:
			return '';
	}
}

@customElement('gl-graph-header')
export class GraphHeader extends SignalWatcher(LitElement) {
	static override styles = [graphStyles];

	@consume({ context: ipcContext, subscribe: true })
	_ipc!: typeof ipcContext.__context__;

	@consume({ context: stateContext, subscribe: true })
	state!: typeof stateContext.__context__;

	@consume({ context: graphStateContext })
	appState!: typeof graphStateContext.__context__;

	get hasFilters() {
		if (this.state.config?.onlyFollowFirstParent) return true;
		if (this.state.excludeTypes == null) return false;

		return Object.values(this.state.excludeTypes).includes(true);
	}
	private handleJumpToRef() {}

	private onRefsVisibilityChanged(refs: GraphExcludedRef[], visible: boolean) {
		this._ipc.sendCommand(UpdateRefsVisibilityCommand, {
			refs: refs,
			visible: visible,
		});
	}

	onOpenPullRequest(pr: NonNullable<NonNullable<State['branchState']>['pr']>): void {
		this._ipc.sendCommand(OpenPullRequestDetailsCommand, { id: pr.id });
	}

	private onSearchOpenInView(search: SearchQuery) {
		this._ipc.sendCommand(SearchOpenInViewCommand, { search: search });
	}

	private onExcludeTypesChanged(key: keyof GraphExcludeTypes, value: boolean) {
		this._ipc.sendCommand(UpdateExcludeTypesCommand, { key: key, value: value });
	}

	private onRefIncludesChanged(branchesVisibility: GraphBranchesVisibility, refs?: GraphRefOptData[]) {
		this._ipc.sendCommand(UpdateIncludedRefsCommand, { branchesVisibility: branchesVisibility, refs: refs });
	}

	private get searchResults() {
		return getSearchResultModel(this.graphSearchingState.state).results;
	}
	private get searchResultsError() {
		return getSearchResultModel(this.graphSearchingState.state).resultsError;
	}

	private getActiveRowInfo(): undefined | { date: number; id: string } {
		if (this.appState.activeRow == null) return undefined;

		const [id, date] = this.appState.activeRow.split('|');
		return {
			date: Number(date),
			id: id,
		};
	}

	private getNextOrPreviousSearchResultIndex(
		index: number,
		next: boolean,
		results: GraphSearchResults,
		query: undefined | SearchQuery,
	) {
		if (next) {
			if (index < results.count - 1) {
				index++;
			} else if (query != null && results?.paging?.hasMore) {
				index = -1; // Indicates a boundary that we should load more results
			} else {
				index = 0;
			}
		} else if (index > 0) {
			index--;
		} else if (query != null && results?.paging?.hasMore) {
			index = -1; // Indicates a boundary that we should load more results
		} else {
			index = results.count - 1;
		}
		return index;
	}

	@consume({ context: graphSearchStateContext })
	private graphSearchingState!: typeof graphSearchStateContext.__context__;

	private getClosestSearchResultIndex(
		results: GraphSearchResults,
		query: undefined | SearchQuery,
		activeRow: undefined | string,
		next: boolean = true,
	): [number, undefined | string] {
		if (results.ids == null) return [0, undefined];

		const activeInfo = this.getActiveRowInfo();
		const activeId = activeInfo?.id;
		if (activeId == null) return [0, undefined];

		let index: undefined | number;
		let nearestId: undefined | string;
		let nearestIndex: undefined | number;

		const data = results.ids[activeId];
		if (data != null) {
			index = data.i;
			nearestId = activeId;
			nearestIndex = index;
		}

		if (index == null) {
			const activeDate = activeInfo?.date != null ? activeInfo.date + (next ? 1 : -1) : undefined;
			if (activeDate == null) return [0, undefined];

			// Loop through the search results and:
			//  try to find the active id
			//  if next=true find the nearest date before the active date
			//  if next=false find the nearest date after the active date

			let i: number;
			let id: string;
			let date: number;
			let nearestDate: undefined | number;
			for ([id, { date, i }] of Object.entries(results.ids)) {
				if (next) {
					if (date < activeDate && (nearestDate == null || date > nearestDate)) {
						nearestId = id;
						nearestDate = date;
						nearestIndex = i;
					}
				} else if (date > activeDate && (nearestDate == null || date <= nearestDate)) {
					nearestId = id;
					nearestDate = date;
					nearestIndex = i;
				}
			}

			index = nearestIndex == null ? results.count - 1 : nearestIndex + (next ? -1 : 1);
		}

		index = this.getNextOrPreviousSearchResultIndex(index, next, results, query);

		return index === nearestIndex ? [index, nearestId] : [index, undefined];
	}

	private get searchPosition(): number {
		if (this.searchResults?.ids == null || !this.graphSearchingState.filter.query) return 0;

		const id = this.getActiveRowInfo()?.id;
		let searchIndex = id ? this.searchResults.ids[id]?.i : undefined;
		if (searchIndex == null) {
			[searchIndex] = this.getClosestSearchResultIndex(
				this.searchResults,
				this.graphSearchingState.filter,
				this.appState.activeRow,
			);
		}
		return searchIndex < 1 ? 1 : searchIndex + 1;
	}

	override render() {
		const repo = this.state.repositories?.find(repo => repo.id === this.state.selectedRepository);
		return html`<header class="titlebar graph-app__header">
			<div class="titlebar__row titlebar__row--wrap">
				<div class="titlebar__group">
					${when(
						repo?.provider?.url,
						() => html`
							<gl-popover placement="bottom">
								<a
									href=${ifDefined(repo!.provider!.url)}
									class="action-button"
									style="margin-right: -0.5rem"
									aria-label=${`Open Repository on ${repo!.provider!.name}`}
									slot="anchor"
									@click=${(e: CustomEvent) =>
										emitTelemetrySentEvent<'graph/action/openRepoOnRemote'>(e.target, {
											name: 'graph/action/openRepoOnRemote',
											data: {},
										})}
								>
									<span>
										<code-icon
											class="action-button__icon"
											icon=${repo!.provider!.icon === 'cloud'
												? 'cloud'
												: `gl-provider-${repo!.provider!.icon}`}
											aria-hidden="true"
										></code-icon>
										${when(
											repo!.provider!.integration?.connected,
											() =>
												html` <gl-indicator
													.style=${`
														margin-left: -0.2rem;
														--gl-indicator-color: green;
														--gl-indicator-size: 0.4rem;
													`}
												></gl-indicator>`,
										)}
									</span>
								</a>
								<span slot="content">
									Open Repository on ${repo!.provider!.name}
									<hr />
									${when(
										repo!.provider!.integration?.connected,
										() => html`
											<span>
												<code-icon
													style="margin-top: -3px"
													icon="check"
													aria-hidden="true"
												></code-icon>
												Connected to ${repo!.provider!.name}
											</span>
										`,
										() => {
											if (repo!.provider!.integration?.connected !== false) {
												return nothing;
											}
											return html`
												<code-icon
													style="margin-top: -3px"
													icon="plug"
													aria-hidden="true"
												></code-icon>
												<a
													href=${createCommandLink<ConnectCloudIntegrationsCommandArgs>(
														'gitlens.plus.cloudIntegrations.connect',
														{
															integrationIds: [repo!.provider!.integration.id],
															source: 'graph',
														},
													)}
												>
													Connect to ${repo!.provider!.name}
												</a>
												<span> &mdash; not connected</span>
											`;
										},
									)}
								</span>
							</gl-popover>
							${when(
								repo?.provider?.integration?.connected === false,
								() => html`
									<gl-button
										appearance="toolbar"
										href=${createCommandLink<ConnectCloudIntegrationsCommandArgs>(
											'gitlens.plus.cloudIntegrations.connect',
											{
												integrationIds: [repo!.provider!.integration!.id],
												source: 'graph',
											},
										)}
									>
										<code-icon icon="plug" style="color: var(--titlebar-fg)"></code-icon>
										<span slot="tooltip">
											Connect to ${repo!.provider!.name}
											<hr />
											View pull requests and issues in the Commit Graph, Launchpad, autolinks, and
											more
										</span>
									</gl-button>
								`,
							)}
						`,
					)}
					<gl-tooltip placement="bottom">
						<button
							type="button"
							class="action-button"
							aria-label="Switch to Another Repository..."
							?disabled=${!this.state.repositories || this.state.repositories.length < 2}
							@click=${() => this.handleChooseRepository()}
						>
							<span class="action-button__truncated"> ${repo?.formattedName ?? 'none selected'} </span>
							${when(
								this.state.repositories && this.state.repositories.length > 1,
								() => html`
									<code-icon
										class="action-button__more"
										icon="chevron-down"
										aria-hidden="true"
									></code-icon>
								`,
							)}
						</button>
						<span slot="content">Switch to Another Repository...</span>
					</gl-tooltip>
					${when(
						this.state.allowed && repo,
						() => html`
							<span>
								<code-icon icon="chevron-right"></code-icon>
							</span>
							${when(
								this.state.branchState?.pr,
								pr => html`
									<gl-popover placement="bottom">
										<button slot="anchor" type="button" class="action-button">
											<issue-pull-request
												type="pr"
												identifier=${`#${pr.id}`}
												status=${pr.state}
												compact
											></issue-pull-request>
										</button>
										<div slot="content">
											<issue-pull-request
												type="pr"
												name=${pr.title}
												url=${pr.url}
												identifier=${`#${pr.id}`}
												status=${pr.state}
												.date=${pr.updatedDate}
												.dateFormat=${this.state.config?.dateFormat}
												.dateStyle=${this.state.config?.dateStyle}
												details
												@gl-issue-pull-request-details=${() => {
													this.onOpenPullRequest(pr);
												}}
											>
											</issue-pull-request>
										</div>
									</gl-popover>
								`,
							)}
							<gl-popover placement="bottom">
								<a
									slot="anchor"
									href=${createWebviewCommandLink(
										'gitlens.graph.switchToAnotherBranch',
										this.state.webviewId,
										this.state.webviewInstanceId,
									)}
									class="action-button"
									style=${this.state.branchState?.pr ? { marginLeft: '-0.6rem' } : {}}
									aria-label="Switch to Another Branch..."
								>
									${this.renderBranchStateIcon()}
									<span class="action-button__truncated">${this.state.branch?.name}</span>
									<code-icon
										class="action-button__more"
										icon="chevron-down"
										aria-hidden="true"
									></code-icon>
								</a>
								<div slot="content">
									<span>
										Switch to Another Branch...
										<hr />
										<code-icon icon="git-branch" aria-hidden="true"></code-icon>
										<span class="md-code">${this.state.branch?.name}</span>
										${when(this.state.branchState?.worktree, () => html`<i> (in a worktree)</i> `)}
									</span>
								</div>
							</gl-popover>
							<gl-button
								class="jump-to-ref"
								appearance="toolbar"
								@click=${this.handleJumpToRef.bind(this)}
							>
								<code-icon icon="target"></code-icon>
								<span slot="tooltip">
									Jump to HEAD
									<br />
									[Alt] Jump to Reference...
								</span>
							</gl-button>
							<span>
								<code-icon icon="chevron-right"></code-icon>
							</span>
							<gl-git-actions-buttons
								.branchName=${this.state.branch?.name}
								.branchState=${this.state.branchState}
								.lastFetched=${this.state.lastFetched}
								.state=${this.state}
							></gl-git-actions-buttons>
						`,
					)}
				</div>
				<div class="titlebar__group">
					<gl-tooltip placement="bottom">
						<a
							class="action-button"
							href=${createCommandLink<BranchGitCommandArgs>(GlCommand.GitCommandsBranch, {
								state: {
									subcommand: 'create',
									reference: this.state.branch,
								},
								command: 'branch',
								confirm: true,
							})}
						>
							<code-icon class="action-button__icon" icon="custom-start-work"></code-icon>
						</a>
						<span slot="content">
							Create New Branch from
							<code-icon icon="git-branch"></code-icon>
							<span class="md-code">${this.state.branch?.name}</span>
						</span>
					</gl-tooltip>
					<gl-tooltip placement="bottom">
						<a
							href=${`command:gitlens.showLaunchpad?${encodeURIComponent(
								JSON.stringify({
									source: 'graph',
								} satisfies Omit<LaunchpadCommandArgs, 'command'>),
							)}`}
							class="action-button"
						>
							<code-icon icon="rocket"></code-icon>
						</a>
						<span slot="content">
							<span style="white-space: break-spaces">
								<strong>Launchpad</strong> &mdash; organizes your pull requests into actionable groups
								to help you focus and keep your team unblocked
							</span>
						</span>
					</gl-tooltip>
					<gl-tooltip placement="bottom">
						<a
							href=${'command:gitlens.views.home.focus'}
							class="action-button"
							aria-label=${`Open GitLens Home View`}
						>
							<span>
								<code-icon
									class="action-button__icon"
									icon=${'gl-gitlens'}
									aria-hidden="true"
								></code-icon>
							</span>
						</a>
						<span slot="content">
							<strong>GitLens Home</strong> — track, manage, and collaborate on your branches and pull
							requests, all in one intuitive hub
						</span>
					</gl-tooltip>
					${when(
						this.state.subscription == null || !isSubscriptionPaid(this.state.subscription),
						() => html`
							<gl-feature-badge
								.source=${{ source: 'graph', detail: 'badge' } as const}
								.subscription=${this.state.subscription}
							></gl-feature-badge>
						`,
					)}
				</div>
			</div>

			${when(
				this.state.allowed &&
					this.state.workingTreeStats != null &&
					(this.state.workingTreeStats.hasConflicts || this.state.workingTreeStats.pausedOpStatus),
				() => html`
					<div class="merge-conflict-warning">
						<gl-merge-rebase-status
							class="merge-conflict-warning__content"
							?conflicts=${this.state.workingTreeStats?.hasConflicts}
							.pausedOpStatus=${this.state.workingTreeStats?.pausedOpStatus}
							skipCommand="gitlens.graph.skipPausedOperation"
							continueCommand="gitlens.graph.continuePausedOperation"
							abortCommand="gitlens.graph.abortPausedOperation"
							openEditorCommand="gitlens.graph.openRebaseEditor"
							.webviewCommandContext=${{
								webview: this.state.webviewId,
								webviewInstance: this.state.webviewInstanceId,
							}}
						></gl-merge-rebase-status>
					</div>
				`,
			)}
			${when(
				this.state.allowed,
				() => html`
					<div class="titlebar__row">
						<div class="titlebar__group">
							<gl-tooltip placement="top" content="Branches Visibility">
								<sl-select
									value=${ifDefined(this.state.branchesVisibility)}
									onSlChange=${() => this.handleBranchesVisibility()}
									hoist
								>
									<code-icon icon="chevron-down" slot="expand-icon"></code-icon>
									<sl-option value="all" ?disabled=${repo?.isVirtual}> All Branches </sl-option>
									<sl-option value="smart" ?disabled=${repo?.isVirtual}>
										Smart Branches
										${when(
											!repo?.isVirtual,
											() => html`
												<gl-tooltip placement="right" slot="suffix">
													<code-icon icon="info"></code-icon>
													<span slot="content">
														Shows only relevant branches
														<br />
														<br />
														<i>
															Includes the current branch, its upstream, and its base or
															target branch
														</i>
													</span>
												</gl-tooltip>
											`,
											() => html` <code-icon icon="info" slot="suffix"></code-icon> `,
										)}
									</sl-option>
									<sl-option value="current">Current Branch</sl-option>
								</sl-select>
							</gl-tooltip>
							<div class=${`shrink ${!Object.values(this.state.excludeRefs ?? {}).length && 'hidden'}`}>
								<gl-popover
									class="popover"
									placement="bottom-start"
									trigger="click focus"
									?arrow=${false}
									distance=${0}
								>
									<gl-tooltip placement="top" slot="anchor">
										<button type="button" id="hiddenRefs" class="action-button">
											<code-icon icon=${`eye-closed`}></code-icon>
											${Object.values(this.state.excludeRefs ?? {}).length}
											<code-icon
												class="action-button__more"
												icon="chevron-down"
												aria-hidden="true"
											></code-icon>
										</button>
										<span slot="content">Hidden Branches / Tags</span>
									</gl-tooltip>
									<div slot="content">
										<menu-label>Hidden Branches / Tags</menu-label>
										${when(this.state.excludeRefs, excludeRefs => {
											if (!Object.keys(excludeRefs).length) {
												return nothing;
											}
											return repeat([...Object.values(excludeRefs), null], ref => {
												if (ref) {
													return html` <menu-item
														@click=${(event: CustomEvent) => {
															this.handleOnToggleRefsVisibilityClick(event, [ref], true);
														}}
														class="flex-gap"
													>
														<code-icon icon=${getRemoteIcon(ref.type)}></code-icon>
														<span>${ref.name}</span>
													</menu-item>`;
												}
												return html` <menu-item
													@click=${(event: CustomEvent) => {
														this.handleOnToggleRefsVisibilityClick(
															event,
															Object.values(excludeRefs ?? {}),
															true,
														);
													}}
												>
													Show All
												</menu-item>`;
											});
										})}
									</div>
								</gl-popover>
							</div>
							<gl-popover
								class="popover"
								placement="bottom-start"
								trigger="click focus"
								?arrow=${false}
								distance=${0}
							>
								<gl-tooltip placement="top" slot="anchor">
									<button type="button" class="action-button">
										<code-icon icon=${`filter${this.hasFilters ? '-filled' : ''}`}></code-icon>
										<code-icon
											class="action-button__more"
											icon="chevron-down"
											aria-hidden="true"
										></code-icon>
									</button>
									<span slot="content">Graph Filtering</span>
								</gl-tooltip>
								<div slot="content">
									<menu-label>Graph Filters</menu-label>
									${when(
										repo?.isVirtual !== true,
										() => html`
											<menu-item role="none">
												<gl-tooltip
													placement="right"
													content="Only follow the first parent of merge commits to provide a more linear history"
												>
													<gl-checkbox
														value="onlyFollowFirstParent"
														@gl-change-value=${this.handleFilterChange}
														checked=${this.state.config?.onlyFollowFirstParent ?? false}
													>
														Simplify Merge History
													</gl-checkbox>
												</gl-tooltip>
											</menu-item>
											<menu-divider></menu-divider>
											<menu-item role="none">
												<gl-checkbox
													value="remotes"
													@gl-change-value=${this.handleFilterChange}
													?checked=${this.state.excludeTypes?.remotes ?? false}
												>
													Hide Remote-only Branches
												</gl-checkbox>
											</menu-item>
											<menu-item role="none">
												<gl-checkbox
													value="stashes"
													@gl-change-value=${this.handleFilterChange}
													?checked=${this.state.excludeTypes?.stashes ?? false}
												>
													Hide Stashes
												</gl-checkbox>
											</menu-item>
										`,
									)}
									<menu-item role="none">
										<gl-checkbox
											value="tags"
											@gl-change-value=${this.handleFilterChange}
											?checked=${this.state.excludeTypes?.tags ?? false}
										>
											Hide Tags
										</gl-checkbox>
									</menu-item>
									<menu-divider></menu-divider>
									<menu-item role="none">
										<gl-checkbox
											value="mergeCommits"
											@gl-change-value=${this.handleFilterChange}
											checked=${this.state.config?.dimMergeCommits ?? false}
										>
											Dim Merge Commit Rows
										</gl-checkbox>
									</menu-item>
								</div>
							</gl-popover>
							<span>
								<span class="action-divider"></span>
							</span>
							<gl-search-box
								step=${this.searchPosition}
								total=${this.searchResults?.count ?? 0}
								valid=${Boolean(this.graphSearchingState.valid)}
								?more=${this.searchResults?.paging?.hasMore ?? false}
								?searching=${this.graphSearchingState.loading}
								?filter=${this.state.defaultSearchMode === 'filter'}
								value=${this.graphSearchingState.filter.query}
								errorMessage=${this.searchResultsError?.error ?? ''}
								?resultsHidden=${this.graphSearchingState.searchResultsHidden}
								?resultsLoaded=${this.searchResults != null}
								@gl-search-inputchange=${(e: CustomEventType<'gl-search-inputchange'>) =>
									this.handleSearchInput(e)}
								@gl-search-navigate=${this.handleSearchNavigation}
								@gl-search-openinview=${() => this.onSearchOpenInView()}
								@gl-search-modechange=${this.handleSearchModeChange}
							></gl-search-box>
							<span>
								<span class="action-divider"></span>
							</span>
							<span class="button-group">
								<gl-tooltip placement="bottom">
									<button
										type="button"
										role="checkbox"
										class="action-button"
										aria-label="Toggle Minimap"
										aria-checked=${this.state.config?.minimap ?? false}
										@click=${() => this.handleOnMinimapToggle()}
									>
										<code-icon class="action-button__icon" icon="graph-line"></code-icon>
									</button>
									<span slot="content">Toggle Minimap</span>
								</gl-tooltip>
								<gl-popover
									class="popover"
									placement="bottom-end"
									trigger="click focus"
									?arrow=${false}
									distance=${0}
								>
									<gl-tooltip placement="top" distance=${7} slot="anchor">
										<button type="button" class="action-button" aria-label="Minimap Options">
											<code-icon
												class="action-button__more"
												icon="chevron-down"
												aria-hidden="true"
											></code-icon>
										</button>
										<span slot="content">Minimap Options</span>
									</gl-tooltip>
									<div slot="content">
										<menu-label>Minimap</menu-label>
										<menu-item role="none">
											<gl-radio-group
												value=${this.state.config?.minimapDataType ?? 'commits'}
												@gl-change-value=${this.handleOnMinimapDataTypeChange}
											>
												<gl-radio name="minimap-datatype" value="commits"> Commits </gl-radio>
												<gl-radio name="minimap-datatype" value="lines">
													Lines Changed
												</gl-radio>
											</gl-radio-group>
										</menu-item>
										<menu-divider></menu-divider>
										<menu-label>Markers</menu-label>
										<menu-item role="none">
											<gl-checkbox
												value="localBranches"
												@gl-change-value=${this.handleOnMinimapAdditionalTypesChange}
												?checked=${this.state.config?.minimapMarkerTypes?.includes(
													'localBranches',
												) ?? false}
											>
												<span class="minimap-marker-swatch" data-marker="localBranches"></span>
												Local Branches
											</gl-checkbox>
										</menu-item>
										<menu-item role="none">
											<gl-checkbox
												value="remoteBranches"
												@gl-change-value=${this.handleOnMinimapAdditionalTypesChange}
												?checked=${this.state.config?.minimapMarkerTypes?.includes(
													'remoteBranches',
												) ?? true}
											>
												<span class="minimap-marker-swatch" data-marker="remoteBranches"></span>
												Remote Branches
											</gl-checkbox>
										</menu-item>
										<menu-item role="none">
											<gl-checkbox
												value="pullRequests"
												@gl-change-value=${this.handleOnMinimapAdditionalTypesChange}
												?checked=${this.state.config?.minimapMarkerTypes?.includes(
													'pullRequests',
												) ?? true}
											>
												<span class="minimap-marker-swatch" data-marker="pullRequests"></span>
												Pull Requests
											</gl-checkbox>
										</menu-item>
										<menu-item role="none">
											<gl-checkbox
												value="stashes"
												@gl-change-value=${this.handleOnMinimapAdditionalTypesChange}
												?checked=${this.state.config?.minimapMarkerTypes?.includes('stashes') ??
												false}
											>
												<span class="minimap-marker-swatch" data-marker="stashes"></span>
												Stashes
											</gl-checkbox>
										</menu-item>
										<menu-item role="none">
											<gl-checkbox
												value="tags"
												@gl-change-value=${this.handleOnMinimapAdditionalTypesChange}
												?checked=${this.state.config?.minimapMarkerTypes?.includes('tags') ??
												true}
											>
												<span class="minimap-marker-swatch" data-marker="tags"></span>
												Tags
											</gl-checkbox>
										</menu-item>
									</div>
								</gl-popover>
							</span>
						</div>
					</div>
				`,
			)}
			<div
				class=${`progress-container infinite${
					this.state.loading || this.state.rowsStatsLoading ? ' active' : ''
				}`}
				role="progressbar"
			>
				<div class="progress-bar"></div>
			</div>
		</header>`;
	}
	handleFilterChange() {
		throw new Error('Method not implemented.');
	}
	handleOnToggleRefsVisibilityClick(event: any, refs: GraphExcludedRef[], visible: boolean) {
		this._ipc.sendCommand(UpdateRefsVisibilityCommand, {
			refs: refs,
			visible: visible,
		});
	}
	handleBranchesVisibility() {
		throw new Error('Method not implemented.');
	}

	private handleSearchInput = (e: CustomEvent<SearchQuery>) => {
		this.graphSearchingState.filter = e.detail;
		// this.appState.searchQuery = e.detail;
		// setSearchResults(undefined);
		// setSearchResultsError(undefined);
		// setSearchResultsHidden(false);
		// setSearching(isValid);
		// this._ipc.sendCommand onSearch?.(isValid ? detail : undefined);
		// this.appState.searchResultsHidden = false;
		// this.appState.searching = true;
		// try {
		// 	void this._ipc.sendRequest(SearchRequest, { search: e.detail /*limit: options?.limit*/ });
		// 	// TODO:
		// 	// this.updateSearchResultState(rsp);
		// } catch {
		// 	this.state.searchResults = undefined;
	};

	handleSearchNavigation(e: CustomEvent<SearchNavigationEventDetail>) {
		const results = this.searchResults;
		if (results == null) return;

		const direction = e.detail?.direction ?? 'next';

		const count = results.count;

		let searchIndex;
		let id: string | undefined;

		let next;
		if (direction === 'first') {
			next = false;
			searchIndex = 0;
		} else if (direction === 'last') {
			next = false;
			searchIndex = -1;
		} else {
			next = direction === 'next';
			[searchIndex, id] = this.getClosestSearchResultIndex(
				results,
				this.graphSearchingState.filter,
				this.appState.activeRow,
				next,
			);
		}

		let iterations = 0;
		// Avoid infinite loops
		while (iterations < 1000) {
			iterations++;

			// Indicates a boundary and we need to load more results
			if (searchIndex === -1) {
				if (next) {
					if (this.graphSearchingState.filter != null && results?.paging?.hasMore) {
						// setSearching(true);
						let moreResults;
						// try {
						// 	moreResults = await onSearchPromise?.(searchQuery, { more: true });
						// } finally {
						// 	setSearching(false);
						// }
						// if (moreResults?.results != null && !('error' in moreResults.results)) {
						// 	if (count < moreResults.results.count) {
						// 		results = moreResults.results;
						// 		searchIndex = count;
						// 		count = results.count;
						// 	} else {
						// 		searchIndex = 0;
						// 	}
						// } else {
						// 	searchIndex = 0;
					}
				} else {
					searchIndex = 0;
				}
			} else if (direction === 'last' && this.graphSearchingState.filter != null && results?.paging?.hasMore) {
				// setSearching(true);
				let moreResults;
				// try {
				// 	moreResults = await onSearchPromise?.(searchQuery, { limit: 0, more: true });
				// } finally {
				// 	setSearching(false);
				// }
				// if (moreResults?.results != null && !('error' in moreResults.results)) {
				// 	if (count < moreResults.results.count) {
				// 		results = moreResults.results;
				// 		count = results.count;
				// 	}
				// 	searchIndex = count;
				// }
			} else {
				searchIndex = count - 1;
			}
		}

		// 	id = id ?? getSearchResultIdByIndex(results, searchIndex);
		// 	if (id != null) {
		// 		id = await ensureSearchResultRow(id);
		// 		if (id != null) break;
		// 	}

		// 	setSearchResultsHidden(true);

		// 	searchIndex = getNextOrPreviousSearchResultIndex(searchIndex, next, results, searchQuery);
		// }

		if (id != null) {
			console.log('[id]', id);
			this.dispatchEvent(new CustomEvent('gl-select-commits', { detail: id }));
			// queueMicrotask(() => graphRef.current?.selectCommits([id], false, true));
		}
	}

	handleSearchModeChange(e: any) {
		// TODO:  loads twice ???
		this.graphSearchingState.filter = {
			...this.graphSearchingState.filter,
			filter: !this.graphSearchingState.filter.filter,
		};
	}
	handleOnMinimapToggle() {
		this._ipc.sendCommand(UpdateGraphConfigurationCommand, { changes: { minimap: !this.state.config?.minimap } });
	}

	handleOnMinimapDataTypeChange(e: Event) {
		if (this.state.config == null) return;

		const $el = e.target as RadioGroup;
		const minimapDataType = $el.value === 'lines' ? 'lines' : 'commits';
		if (this.state.config.minimapDataType === minimapDataType) return;

		this._ipc.sendCommand(UpdateGraphConfigurationCommand, { changes: { minimapDataType: minimapDataType } });
	}

	private handleOnMinimapAdditionalTypesChange = (e: Event) => {
		if (this.state.config?.minimapMarkerTypes == null) return;

		const $el = e.target as HTMLInputElement;
		const value = $el.value as GraphMinimapMarkerTypes;

		if ($el.checked) {
			if (!this.state.config.minimapMarkerTypes.includes(value)) {
				const minimapMarkerTypes = [...this.state.config.minimapMarkerTypes, value];
				// setGraphConfig({ ...config, minimapMarkerTypes: minimapMarkerTypes });
				this._ipc.sendCommand(UpdateGraphConfigurationCommand, {
					changes: { minimapMarkerTypes: minimapMarkerTypes },
				});
			}
		} else {
			const index = this.state.config.minimapMarkerTypes.indexOf(value);
			if (index !== -1) {
				const minimapMarkerTypes = [...this.state.config.minimapMarkerTypes];
				minimapMarkerTypes.splice(index, 1);
				// setGraphConfig({ ...graphConfig, minimapMarkerTypes: minimapMarkerTypes });
				this._ipc.sendCommand(UpdateGraphConfigurationCommand, {
					changes: { minimapMarkerTypes: minimapMarkerTypes },
				});
			}
		}
	};
	renderBranchStateIcon(): unknown {
		const { branchState } = this.state;
		if (branchState?.pr) {
			return nothing;
		}
		if (branchState?.worktree) {
			return html`<code-icon icon="gl-worktrees-view" aria-hidden="true"></code-icon>`;
		}
		return html`<code-icon icon="git-branch" aria-hidden="true"></code-icon>`;
	}
	handleChooseRepository() {
		throw new Error('Method not implemented.');
	}
}

new GraphHeader();
