import type { GraphRefOptData } from '@gitkraken/gitkraken-components';
import { css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { repeat } from 'lit/directives/repeat.js';
import { when } from 'lit/directives/when.js';
/*global document window*/
import '@shoelace-style/shoelace/dist/components/select/select.component.js';
import '@shoelace-style/shoelace/dist/components/option/option.component.js';
import type { ConnectCloudIntegrationsCommandArgs } from '../../../../commands/cloudIntegrations';
import type { BranchGitCommandArgs } from '../../../../commands/git/branch';
import type { GraphBranchesVisibility } from '../../../../config';
import { GlCommand } from '../../../../constants.commands';
import type { SearchQuery } from '../../../../constants.search';
import { isSubscriptionPaid } from '../../../../plus/gk/utils/subscription.utils';
import type { LaunchpadCommandArgs } from '../../../../plus/launchpad/launchpad';
import { Color } from '../../../../system/color';
import { createCommandLink } from '../../../../system/commands';
import { createWebviewCommandLink } from '../../../../system/webview';
import type {
	GraphExcludedRef,
	GraphExcludeTypes,
	GraphSearchResults,
	GraphSearchResultsError,
	State,
} from '../../../plus/graph/protocol';
import {
	OpenPullRequestDetailsCommand,
	SearchOpenInViewCommand,
	UpdateExcludeTypesCommand,
	UpdateIncludedRefsCommand,
	UpdateRefsVisibilityCommand,
} from '../../../plus/graph/protocol';
import type { StateProvider } from '../../shared/app';
import { GlApp } from '../../shared/app';
import '../../shared/components/branch-icon';
import '../../shared/components/button';
import '../../shared/components/code-icon';
import '../../shared/components/menu';
import '../../shared/components/overlays/popover';
import '../../shared/components/overlays/tooltip';
import '../../shared/components/rich/issue-pull-request';
import type { HostIpc } from '../../shared/ipc';
import { emitTelemetrySentEvent } from '../../shared/telemetry';
import type { ThemeChangeEvent } from '../../shared/theme';
import '../shared/components/merge-rebase-status';
import './actions/gitActionsButtons.wc';
import './graph-wrapper';
import './graph-header';
import './graph.scss';
import { stateContext } from './context';
import graphStyles from './graph.scss?lit';
import { GraphStateProvider } from './stateProvider';
import type { CustomEventType } from '../../shared/components/element';
import { consume } from '@lit/context';

function getSearchResultModel(state: State): {
	results: GraphSearchResults | undefined;
	resultsError: GraphSearchResultsError | undefined;
} {
	let results: GraphSearchResults | undefined;
	let resultsError: GraphSearchResultsError | undefined;
	if (state.searchResults != null) {
		if ('error' in state.searchResults) {
			resultsError = state.searchResults;
		} else {
			results = state.searchResults;
		}
	}
	return { results: results, resultsError: resultsError };
}

function getRemoteIcon(type: string | number) {
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

const graphLaneThemeColors = new Map([
	['--vscode-gitlens-graphLane1Color', '#15a0bf'],
	['--vscode-gitlens-graphLane2Color', '#0669f7'],
	['--vscode-gitlens-graphLane3Color', '#8e00c2'],
	['--vscode-gitlens-graphLane4Color', '#c517b6'],
	['--vscode-gitlens-graphLane5Color', '#d90171'],
	['--vscode-gitlens-graphLane6Color', '#cd0101'],
	['--vscode-gitlens-graphLane7Color', '#f25d2e'],
	['--vscode-gitlens-graphLane8Color', '#f2ca33'],
	['--vscode-gitlens-graphLane9Color', '#7bd938'],
	['--vscode-gitlens-graphLane10Color', '#2ece9d'],
]);

@customElement('gl-graph-app')
export class GraphApp extends GlApp<State> {
	@state()
	searching: string = '';
	searchResultsHidden: unknown;
	get hasFilters() {
		if (this.state.config?.onlyFollowFirstParent) return true;
		if (this.state.excludeTypes == null) return false;

		return Object.values(this.state.excludeTypes).includes(true);
	}
	private handleJumpToRef() {}
	protected override createStateProvider(state: State, ipc: HostIpc): StateProvider<State> {
		return new GraphStateProvider(this, state, ipc);
	}

	// private override get state() {
	// 	return this.state;
	// }

	static override styles = [
		graphStyles,
		css`
			gl-graph-wrapper {
				height: 100%;
			}
		`,
	];

	// protected override createRenderRoot(): HTMLElement | DocumentFragment {
	// 	return this;
	// }

	override connectedCallback(): void {
		super.connectedCallback();
		// this.ensureTheming(this.state);
	}

	// TODO: doesn't work
	protected override onThemeUpdated(e: ThemeChangeEvent) {
		const rootStyle = document.documentElement.style;

		const backgroundColor = Color.from(e.colors.background);
		const foregroundColor = Color.from(e.colors.foreground);

		const backgroundLuminance = backgroundColor.getRelativeLuminance();
		const foregroundLuminance = foregroundColor.getRelativeLuminance();

		const themeLuminance = (luminance: number) => {
			let min;
			let max;
			if (foregroundLuminance > backgroundLuminance) {
				max = foregroundLuminance;
				min = backgroundLuminance;
			} else {
				min = foregroundLuminance;
				max = backgroundLuminance;
			}
			const percent = luminance / 1;
			return percent * (max - min) + min;
		};

		// minimap and scroll markers

		let c = Color.fromCssVariable('--vscode-scrollbarSlider-background', e.computedStyle);
		rootStyle.setProperty(
			'--color-graph-minimap-visibleAreaBackground',
			c.luminance(themeLuminance(e.isLightTheme ? 0.6 : 0.1)).toString(),
		);

		if (!e.isLightTheme) {
			c = Color.fromCssVariable('--color-graph-scroll-marker-local-branches', e.computedStyle);
			rootStyle.setProperty(
				'--color-graph-minimap-tip-branchBackground',
				c.luminance(themeLuminance(0.55)).toString(),
			);

			c = Color.fromCssVariable('--color-graph-scroll-marker-local-branches', e.computedStyle);
			rootStyle.setProperty(
				'--color-graph-minimap-tip-branchBorder',
				c.luminance(themeLuminance(0.55)).toString(),
			);

			c = Color.fromCssVariable('--vscode-editor-foreground', e.computedStyle);
			const tipForeground = c.isLighter() ? c.luminance(0.01).toString() : c.luminance(0.99).toString();
			rootStyle.setProperty('--color-graph-minimap-tip-headForeground', tipForeground);
			rootStyle.setProperty('--color-graph-minimap-tip-upstreamForeground', tipForeground);
			rootStyle.setProperty('--color-graph-minimap-tip-highlightForeground', tipForeground);
			rootStyle.setProperty('--color-graph-minimap-tip-branchForeground', tipForeground);
		}

		const branchStatusLuminance = themeLuminance(e.isLightTheme ? 0.72 : 0.064);
		const branchStatusHoverLuminance = themeLuminance(e.isLightTheme ? 0.64 : 0.076);
		const branchStatusPillLuminance = themeLuminance(e.isLightTheme ? 0.92 : 0.02);
		// branch status ahead
		c = Color.fromCssVariable('--branch-status-ahead-foreground', e.computedStyle);
		rootStyle.setProperty('--branch-status-ahead-background', c.luminance(branchStatusLuminance).toString());
		rootStyle.setProperty(
			'--branch-status-ahead-hover-background',
			c.luminance(branchStatusHoverLuminance).toString(),
		);
		rootStyle.setProperty(
			'--branch-status-ahead-pill-background',
			c.luminance(branchStatusPillLuminance).toString(),
		);

		// branch status behind
		c = Color.fromCssVariable('--branch-status-behind-foreground', e.computedStyle);
		rootStyle.setProperty('--branch-status-behind-background', c.luminance(branchStatusLuminance).toString());
		rootStyle.setProperty(
			'--branch-status-behind-hover-background',
			c.luminance(branchStatusHoverLuminance).toString(),
		);
		rootStyle.setProperty(
			'--branch-status-behind-pill-background',
			c.luminance(branchStatusPillLuminance).toString(),
		);

		// branch status both
		c = Color.fromCssVariable('--branch-status-both-foreground', e.computedStyle);
		rootStyle.setProperty('--branch-status-both-background', c.luminance(branchStatusLuminance).toString());
		rootStyle.setProperty(
			'--branch-status-both-hover-background',
			c.luminance(branchStatusHoverLuminance).toString(),
		);
		rootStyle.setProperty(
			'--branch-status-both-pill-background',
			c.luminance(branchStatusPillLuminance).toString(),
		);

		// if (e.isInitializing) return;

		// this.state.theming = undefined;
	}

	private onRefsVisibilityChanged(refs: GraphExcludedRef[], visible: boolean) {
		this._ipc.sendCommand(UpdateRefsVisibilityCommand, {
			refs: refs,
			visible: visible,
		});
	}

	// private async onHoverRowPromise(row: GraphRow) {
	// 	try {
	// 		const request = await this.sendRequest(GetRowHoverRequest, {
	// 			type: row.type as GitGraphRowType,
	// 			id: row.sha,
	// 		});
	// 		this._telemetry.sendEvent({ name: 'graph/row/hovered', data: {} });
	// 		return request;
	// 	} catch (ex) {
	// 		return { id: row.sha, markdown: { status: 'rejected' as const, reason: ex } };
	// 	}
	// }

	// private async onJumpToRefPromise(alt: boolean): Promise<{ name: string; sha: string } | undefined> {
	// 	try {
	// 		// Assuming we have a command to get the ref details
	// 		const rsp = await this.sendRequest(ChooseRefRequest, { alt: alt });
	// 		this._telemetry.sendEvent({ name: 'graph/action/jumpTo', data: { alt: alt } });
	// 		return rsp;
	// 	} catch {
	// 		return undefined;
	// 	}
	// }

	onOpenPullRequest(pr: NonNullable<NonNullable<State['branchState']>['pr']>): void {
		this._ipc.sendCommand(OpenPullRequestDetailsCommand, { id: pr.id });
	}

	// private async onSearch(search: SearchQuery | undefined, options?: { limit?: number }) {
	// 	if (search == null) {
	// 		this.state.searchResults = undefined;
	// 	}
	// 	try {
	// 		const rsp = await this.sendRequest(SearchRequest, { search: search, limit: options?.limit });
	// 		this.updateSearchResultState(rsp);
	// 	} catch {
	// 		this.state.searchResults = undefined;
	// 	}
	// }

	// private async onSearchPromise(search: SearchQuery, options?: { limit?: number; more?: boolean }) {
	// 	try {
	// 		const rsp = await this.sendRequest(SearchRequest, {
	// 			search: search,
	// 			limit: options?.limit,
	// 			more: options?.more,
	// 		});
	// 		this.updateSearchResultState(rsp);
	// 		return rsp;
	// 	} catch {
	// 		return undefined;
	// 	}
	// }

	private onSearchOpenInView(search: SearchQuery) {
		this._ipc.sendCommand(SearchOpenInViewCommand, { search: search });
	}

	// private async onEnsureRowPromise(id: string, select: boolean) {
	// 	try {
	// 		return await this.sendRequest(EnsureRowRequest, { id: id, select: select });
	// 	} catch {
	// 		return undefined;
	// 	}
	// }

	private onExcludeTypesChanged(key: keyof GraphExcludeTypes, value: boolean) {
		this._ipc.sendCommand(UpdateExcludeTypesCommand, { key: key, value: value });
	}

	private onRefIncludesChanged(branchesVisibility: GraphBranchesVisibility, refs?: GraphRefOptData[]) {
		this._ipc.sendCommand(UpdateIncludedRefsCommand, { branchesVisibility: branchesVisibility, refs: refs });
	}

	// private updateSearchResultState(params: DidSearchParams) {
	// 	this.state.searchResults = params.results;
	// 	if (params.selectedRows != null) {
	// 		this.state.selectedRows = params.selectedRows;
	// 	}
	// 	this.setState(this.state, DidSearchNotification);
	// }

	private renderHeader() {
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
													.style=${css`
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
							onClick=${() => this.handleChooseRepository()}
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
													debugger;
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
								branchName=${this.state.branch!.name}
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
														onChange=${() => this.handleFilterChange()}
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
													onChange=${this.handleFilterChange}
													?checked=${this.state.excludeTypes?.remotes ?? false}
												>
													Hide Remote-only Branches
												</gl-checkbox>
											</menu-item>
											<menu-item role="none">
												<gl-checkbox
													value="stashes"
													onChange=${this.handleFilterChange}
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
											onChange=${this.handleFilterChange}
											?checked=${this.state.excludeTypes?.tags ?? false}
										>
											Hide Tags
										</gl-checkbox>
									</menu-item>
									<menu-divider></menu-divider>
									<menu-item role="none">
										<gl-checkbox
											value="mergeCommits"
											onChange=${this.handleFilterChange}
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
							<!-- <gl-search-box
								step={searchPosition}
								total={searchResults?.count ?? 0}
								valid={Boolean(searchQuery?.query && searchQuery.query.length > 2)}
								more={searchResults?.paging?.hasMore ?? false}
								searching={this.searching}
								?filter={this.state.defaultSearchMode === 'filter'}
								value={searchQuery?.query ?? ''}
								errorMessage={getSearchResultModel(this.state).resultsError?.error ?? ''}
								?resultsHidden={this.searchResultsHidden}
								?resultsLoaded={this.state.searchResults != null}
								@gl-search-inputchange={(e: CustomEventType<'gl-search-inputchange'>) => this.handleSearchInput(e)}
								@gl-search-navigate={(e: CustomEventType<'gl-search-navigate'>) => this.handleSearchNavigation(e)}
								@gl-search-openinview={() => this.onSearchOpenInView()}
								@gl-search-modechange={(e: CustomEventType<'gl-search-modechange'>) => this.handleSearchModeChange(e)}
							></gl-search-box> -->
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
										onClick=${() => this.handleOnMinimapToggle()}
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
											<gl-radioGroup
												value=${this.state.config?.minimapDataType ?? 'commits'}
												onChange=${() => this.handleOnMinimapDataTypeChange()}
											>
												<gl-radio name="minimap-datatype" value="commits"> Commits </gl-radio>
												<gl-radio name="minimap-datatype" value="lines">
													Lines Changed
												</gl-radio>
											</gl-radioGroup>
										</menu-item>
										<menu-divider></menu-divider>
										<menu-label>Markers</menu-label>
										<menu-item role="none">
											<gl-checkbox
												value="localBranches"
												onChange=${() => this.handleOnMinimapAdditionalTypesChange()}
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
												onChange=${() => this.handleOnMinimapAdditionalTypesChange()}
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
												onChange=${() => this.handleOnMinimapAdditionalTypesChange()}
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
												onChange=${() => this.handleOnMinimapAdditionalTypesChange()}
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
												onChange=${() => this.handleOnMinimapAdditionalTypesChange()}
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
	handleOnToggleRefsVisibilityClick(event: any, arg1: any[], arg2: boolean) {
		throw new Error('Method not implemented.');
	}
	handleBranchesVisibility() {
		throw new Error('Method not implemented.');
	}
	handleSearchInput(e: any) {
		throw new Error('Method not implemented.');
	}
	handleSearchNavigation(e: any) {
		throw new Error('Method not implemented.');
	}
	handleSearchModeChange(e: any) {
		throw new Error('Method not implemented.');
	}
	handleOnMinimapToggle() {
		throw new Error('Method not implemented.');
	}
	handleOnMinimapDataTypeChange() {
		throw new Error('Method not implemented.');
	}
	handleOnMinimapAdditionalTypesChange() {
		throw new Error('Method not implemented.');
	}
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

	override render() {
		if (!this.state) {
			return html`state error`;
		}
		return html`<gl-graph-header></gl-graph-header><gl-graph-wrapper></gl-graph-wrapper>`;
	}
}

new GraphApp();
