import type { CssVariables } from '@gitkraken/gitkraken-components';
import { ContextProvider, createContext } from '@lit/context';
import { signal } from '@lit-labs/signals';
import type { ReactiveControllerHost } from 'lit';
import { SignalObject } from 'signal-utils/object';
import type { SearchQuery } from '../../../../constants.search';
import type { DidSearchParams, State } from '../../../plus/graph/protocol';
import {
	DidChangeAvatarsNotification,
	DidChangeBranchStateNotification,
	DidChangeColumnsNotification,
	DidChangeGraphConfigurationNotification,
	DidChangeNotification,
	DidChangeRefsMetadataNotification,
	DidChangeRefsVisibilityNotification,
	DidChangeRepoConnectionNotification,
	DidChangeRowsNotification,
	DidChangeRowsStatsNotification,
	DidChangeScrollMarkersNotification,
	DidChangeSelectionNotification,
	DidChangeSubscriptionNotification,
	DidChangeWorkingTreeNotification,
	DidFetchNotification,
	DidSearchNotification,
	DidStartFeaturePreviewNotification,
	SearchRequest,
} from '../../../plus/graph/protocol';
import { DidChangeHostWindowFocusNotification } from '../../../protocol';
import type { StateProvider } from '../../shared/app';
import { AsyncComputedState } from '../../shared/components/signal-utils';
import type { Disposable } from '../../shared/events';
import type { HostIpc } from '../../shared/ipc';
import { stateContext } from './context';

type ReactiveElementHost = Partial<ReactiveControllerHost> & HTMLElement;

interface AppState {
	activeDay?: number;
	activeRow?: string;
	visibleDays?: {
		top: number;
		bottom: number;
	};
	theming?: { cssVariables: CssVariables; themeOpacityFactor: number };
}

export class GraphAppState implements AppState {
	private readonly _activeDay = signal<number | undefined>(undefined);

	set activeDay(activeDay: number | undefined) {
		this._activeDay.set(activeDay);
	}
	get activeDay() {
		return this._activeDay.get();
	}

	private readonly _activeRow = signal<string | undefined>(undefined);

	set activeRow(activeRow: string | undefined) {
		this._activeRow.set(activeRow);
	}
	get activeRow() {
		return this._activeRow.get();
	}
	private readonly _visibleDays = new SignalObject<NonNullable<AppState['visibleDays']>>({ top: 0, bottom: 0 });

	set visibleDays(visibleDays: typeof this._visibleDays) {
		this._visibleDays.bottom = visibleDays.bottom;
		this._visibleDays.top = visibleDays.top;
	}
	get visibleDays() {
		return { top: this._visibleDays.top, bottom: this._visibleDays.bottom };
	}

	private readonly _theming = new SignalObject<NonNullable<AppState['theming']>>({
		cssVariables: {},
		themeOpacityFactor: 1,
	});

	set theming(theming: typeof this._theming) {
		this._theming.cssVariables = theming.cssVariables;
		this._theming.themeOpacityFactor = theming.themeOpacityFactor;
	}
	get theming() {
		return { themeOpacityFactor: this._theming.themeOpacityFactor, cssVariables: this._theming.cssVariables };
	}
}
export const graphStateContext = createContext<GraphAppState>('graphState');

export class GraphSearchingState extends AsyncComputedState<DidSearchParams> {
	private readonly _disposable: Disposable | undefined;

	constructor(private readonly _ipc: HostIpc) {
		super(
			async _abortSignal => {
				if (this.valid) {
					const rsp = await this._ipc.sendRequest(SearchRequest, {
						search: this.filter,
						more: this._loadMore.get(),
					});
					this._loadMore.set(false);
					// this._ipc.sendCommand();
					return rsp;
				}
				return { results: undefined, selectedRows: undefined };
			},
			{ debounce: 250 },
		);
	}

	private _loadMore = signal(false);

	loadMore() {
		this._loadMore.set(true);
		this.run(true);
	}

	get valid() {
		return this._filter.query.length >= 3;
	}

	get loading() {
		return this.computed.status === 'pending';
	}

	dispose() {
		this._disposable?.dispose();
	}

	private readonly _filter = new SignalObject<SearchQuery>({ query: '' });
	get filter(): SearchQuery {
		return {
			query: this._filter.query,
			matchAll: this._filter.matchAll,
			matchCase: this._filter.matchCase,
			matchRegex: this._filter.matchRegex,
			filter: this._filter.filter,
		};
	}

	private readonly _searchResultsHidden = signal(false);
	get searchResultsHidden() {
		return this._searchResultsHidden.get();
	}
	set searchResultsHidden(searchResultsHidden: boolean) {
		this._searchResultsHidden.set(searchResultsHidden);
	}

	set filter(query: SearchQuery) {
		const invalidate = query.query !== this._filter.query;
		this._filter.filter = query.filter;
		this._filter.matchAll = query.matchAll;
		this._filter.matchCase = query.matchCase;
		this._filter.matchRegex = query.matchRegex;
		this._filter.query = query.query;
		this.searchResultsHidden = false;
		if (invalidate) {
			this.run(true);
		}
	}
}

export const graphSearchStateContext = createContext<GraphSearchingState>('searchState');

export class GraphStateProvider implements StateProvider<State> {
	private readonly disposable: Disposable;
	private readonly provider: ContextProvider<{ __context__: State }, ReactiveElementHost>;

	private readonly _state: State;
	get state() {
		return this._state;
	}

	constructor(
		host: ReactiveElementHost,
		state: State,
		private readonly _ipc: HostIpc,
	) {
		this._state = state;
		this.provider = new ContextProvider(host, { context: stateContext, initialValue: state });
		console.log('initial state', state);

		this.disposable = this._ipc.onReceiveMessage(msg => {
			console.log('state update', msg);
			switch (true) {
				case DidChangeNotification.is(msg):
					for (const key in msg.params.state) {
						// @ts-expect-error dynamic object key ejection doesn't work in typescript
						this._state[key] = msg.params.state[key];
					}
					this.provider.setValue(this._state, true);
					break;

				case DidFetchNotification.is(msg):
					this._state.lastFetched = msg.params.lastFetched;
					this.provider.setValue(this._state, true);
					break;

				case DidChangeAvatarsNotification.is(msg):
					this._state.avatars = msg.params.avatars;
					this.provider.setValue(this._state, true);
					break;
				case DidStartFeaturePreviewNotification.is(msg):
					this._state.featurePreview = msg.params.featurePreview;
					this._state.allowed = msg.params.allowed;
					this.provider.setValue(this._state, true);
					break;
				case DidChangeBranchStateNotification.is(msg):
					this._state.branchState = msg.params.branchState;
					this.provider.setValue(this._state, true);
					break;

				case DidChangeHostWindowFocusNotification.is(msg):
					this._state.windowFocused = msg.params.focused;
					this.provider.setValue(this._state, true);
					break;

				case DidChangeColumnsNotification.is(msg):
					this._state.columns = msg.params.columns;
					this._state.context = {
						...this._state.context,
						header: msg.params.context,
						settings: msg.params.settingsContext,
					};
					this.provider.setValue(this._state, true);
					break;

				case DidChangeRefsVisibilityNotification.is(msg):
					this._state.branchesVisibility = msg.params.branchesVisibility;
					this._state.excludeRefs = msg.params.excludeRefs;
					this._state.excludeTypes = msg.params.excludeTypes;
					this._state.includeOnlyRefs = msg.params.includeOnlyRefs;
					this.provider.setValue(this._state, true);
					break;

				case DidChangeRefsMetadataNotification.is(msg):
					this._state.refsMetadata = msg.params.metadata;
					this.provider.setValue(this._state, true);
					break;

				case DidChangeRowsNotification.is(msg): {
					let rows;
					if (
						msg.params.rows.length &&
						msg.params.paging?.startingCursor != null &&
						this._state.rows != null
					) {
						const previousRows = this._state.rows;
						const lastId = previousRows[previousRows.length - 1]?.sha;

						let previousRowsLength = previousRows.length;
						const newRowsLength = msg.params.rows.length;

						this.log(
							`paging in ${newRowsLength} rows into existing ${previousRowsLength} rows at ${msg.params.paging.startingCursor} (last existing row: ${lastId})`,
						);

						rows = [];
						// Preallocate the array to avoid reallocations
						rows.length = previousRowsLength + newRowsLength;

						if (msg.params.paging.startingCursor !== lastId) {
							this.log(`searching for ${msg.params.paging.startingCursor} in existing rows`);

							let i = 0;
							let row;
							for (row of previousRows) {
								rows[i++] = row;
								if (row.sha === msg.params.paging.startingCursor) {
									this.log(`found ${msg.params.paging.startingCursor} in existing rows`);

									previousRowsLength = i;

									if (previousRowsLength !== previousRows.length) {
										// If we stopped before the end of the array, we need to trim it
										rows.length = previousRowsLength + newRowsLength;
									}

									break;
								}
							}
						} else {
							for (let i = 0; i < previousRowsLength; i++) {
								rows[i] = previousRows[i];
							}
						}

						for (let i = 0; i < newRowsLength; i++) {
							rows[previousRowsLength + i] = msg.params.rows[i];
						}
					} else {
						this.log(`setting to ${msg.params.rows.length} rows`);

						if (msg.params.rows.length === 0) {
							rows = this._state.rows;
						} else {
							rows = msg.params.rows;
						}
					}

					this._state.avatars = msg.params.avatars;
					this._state.downstreams = msg.params.downstreams;
					if (msg.params.refsMetadata !== undefined) {
						this._state.refsMetadata = msg.params.refsMetadata;
					}
					this._state.rows = rows;
					this._state.paging = msg.params.paging;
					if (msg.params.rowsStats != null) {
						this._state.rowsStats = { ...this._state.rowsStats, ...msg.params.rowsStats };
					}
					this._state.rowsStatsLoading = msg.params.rowsStatsLoading;
					if (msg.params.selectedRows != null) {
						this._state.selectedRows = msg.params.selectedRows;
					}
					this._state.loading = false;
					this.provider.setValue(this._state, true);

					// setLogScopeExit(scope, ` \u2022 rows=${this._state.rows?.length ?? 0}`);
					break;
				}
				case DidChangeRowsStatsNotification.is(msg):
					this._state.rowsStats = { ...this._state.rowsStats, ...msg.params.rowsStats };
					this._state.rowsStatsLoading = msg.params.rowsStatsLoading;
					this.provider.setValue(this._state, true);
					break;

				case DidChangeScrollMarkersNotification.is(msg):
					this._state.context = { ...this._state.context, settings: msg.params.context };
					this.provider.setValue(this._state, true);
					break;

				case DidSearchNotification.is(msg):
					console.log('DidSearchNotification', msg.params);
					if (msg.params.selectedRows != null) {
						this.state.selectedRows = msg.params.selectedRows;
					}
					this._state.searchResults = msg.params.results;
					this.provider.setValue(this._state, true);
					break;

				case DidChangeSelectionNotification.is(msg):
					this._state.selectedRows = msg.params.selection;
					this.provider.setValue(this._state, true);
					break;

				case DidChangeGraphConfigurationNotification.is(msg):
					this._state.config = msg.params.config;
					this.provider.setValue(this._state, true);
					break;

				case DidChangeSubscriptionNotification.is(msg):
					this._state.subscription = msg.params.subscription;
					this._state.allowed = msg.params.allowed;
					this.provider.setValue(this._state, true);
					break;

				case DidChangeWorkingTreeNotification.is(msg):
					this._state.workingTreeStats = msg.params.stats;
					this.provider.setValue(this._state, true);
					break;

				case DidChangeRepoConnectionNotification.is(msg):
					this._state.repositories = msg.params.repositories;
					this.provider.setValue(this._state, true);
					break;
			}
		});
	}

	private log(...messages: any[]) {
		console.log(...messages);
	}

	dispose(): void {
		this.disposable.dispose();
	}
}
