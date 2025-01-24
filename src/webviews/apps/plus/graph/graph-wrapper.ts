import type GraphContainer from '@gitkraken/gitkraken-components';
import type { CssVariables, GraphRef, GraphRow, GraphSearchMode } from '@gitkraken/gitkraken-components';
import { consume } from '@lit/context';
import { SignalWatcher } from '@lit-labs/signals';
import r2wc from '@r2wc/react-to-web-component';
import type { PropertyValues } from 'lit';
import { html, LitElement } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import type { GitGraphRowType } from '../../../../git/models/graph';
import { getCssVariable, mix, opacity } from '../../../../system/color';
import { forEach } from '../../../../system/iterable';
import type {
	GraphAvatars,
	GraphColumnsConfig,
	GraphExcludedRef,
	GraphMissingRefsMetadata,
	GraphRefMetadataItem,
	State,
	UpdateGraphConfigurationParams,
} from '../../../plus/graph/protocol';
import {
	DoubleClickedCommandType,
	GetMissingAvatarsCommand,
	GetMissingRefsMetadataCommand,
	GetMoreRowsCommand,
	UpdateColumnsCommand,
	UpdateGraphConfigurationCommand,
	UpdateGraphSearchModeCommand,
	UpdateRefsVisibilityCommand,
} from '../../../plus/graph/protocol';
import { UpdateSelectionCommand } from '../../../rebase/protocol';
import { ipcContext } from '../../shared/context';
import { stateContext } from './context';
import { SafeGraphWrapper } from './GraphWrapper';
import { graphStateContext } from './stateProvider';

/** wrap handler to custom event listener */
function $w<T>(handler: (prop: T) => void) {
	return (e: CustomEvent<T>) => {
		handler(e.detail);
	};
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

const WebGraph = r2wc(SafeGraphWrapper, {
	props: {
		avatars: 'json',
		columns: 'json',
		context: 'json',
		theming: 'json',
		config: 'json',
		downstreams: 'json',
		excludeRefs: 'json',
		excludeTypes: 'json',
		rows: 'json',
		includeOnlyRefs: 'json',
		windowFocused: 'boolean',
		loading: 'boolean',
		selectedRows: 'json',
		nonce: 'string',
		refsMetadata: 'json',
		rowsStats: 'json',
		workingTreeStats: 'json',
		paging: 'json',
		setRef: 'function',
	},

	events: [
		'onChangeColumns',
		'onChangeGraphConfiguration',
		'onChangeGraphSearchMode',
		'onChangeRefsVisibility',
		'onChangeSelection',
		'onDoubleClickRef',
		'onDoubleClickRow',
		'onHoverRowPromise',
		'onMissingAvatars',
		'onMissingRefsMetadata',
		'onMoreRows',
		'onSearch',
		'onSearchPromise',
		'onSearchOpenInView',
		'onChangeVisibleDays',
	],
});

customElements.define('web-graph', WebGraph);

@customElement('gl-graph-wrapper')
export class GLGraphWrapper extends SignalWatcher(LitElement) {
	protected override createRenderRoot(): HTMLElement | DocumentFragment {
		return this;
	}
	@consume<State>({ context: stateContext, subscribe: true })
	private _state!: State;

	@consume({ context: ipcContext })
	private _ipc!: typeof ipcContext.__context__;

	// static override get styles() {
	// 	return [
	// 		graphStyles,
	// 		css`
	// 			web-graph {
	// 				height: 100%;
	// 				display: flex;
	// 			}
	// 		`,
	// 	] as CSSResultArray;
	// }

	private getGraphTheming(): { cssVariables: CssVariables; themeOpacityFactor: number } {
		// this will be called on theme updated as well as on config updated since it is dependent on the column colors from config changes and the background color from the theme
		const computedStyle = window.getComputedStyle(document.documentElement);
		const bgColor = getCssVariable('--color-background', computedStyle);

		const mixedGraphColors: CssVariables = {};

		let i = 0;
		let color;
		for (const [colorVar, colorDefault] of graphLaneThemeColors) {
			color = getCssVariable(colorVar, computedStyle) || colorDefault;

			mixedGraphColors[`--column-${i}-color`] = color;

			mixedGraphColors[`--graph-color-${i}`] = color;
			for (const mixInt of [15, 25, 45, 50]) {
				mixedGraphColors[`--graph-color-${i}-bg${mixInt}`] = mix(bgColor, color, mixInt);
			}
			for (const mixInt of [10, 50]) {
				mixedGraphColors[`--graph-color-${i}-f${mixInt}`] = opacity(color, mixInt);
			}

			i++;
		}

		const isHighContrastTheme =
			document.body.classList.contains('vscode-high-contrast') ||
			document.body.classList.contains('vscode-high-contrast-light');

		return {
			cssVariables: {
				'--app__bg0': bgColor,
				'--panel__bg0': getCssVariable('--color-graph-background', computedStyle),
				'--panel__bg1': getCssVariable('--color-graph-background2', computedStyle),
				'--section-border': getCssVariable('--color-graph-background2', computedStyle),

				'--selected-row': getCssVariable('--color-graph-selected-row', computedStyle),
				'--selected-row-border': isHighContrastTheme
					? `1px solid ${getCssVariable('--color-graph-contrast-border', computedStyle)}`
					: 'none',
				'--hover-row': getCssVariable('--color-graph-hover-row', computedStyle),
				'--hover-row-border': isHighContrastTheme
					? `1px dashed ${getCssVariable('--color-graph-contrast-border', computedStyle)}`
					: 'none',

				'--scrollable-scrollbar-thickness': getCssVariable('--graph-column-scrollbar-thickness', computedStyle),
				'--scroll-thumb-bg': getCssVariable('--vscode-scrollbarSlider-background', computedStyle),

				'--scroll-marker-head-color': getCssVariable('--color-graph-scroll-marker-head', computedStyle),
				'--scroll-marker-upstream-color': getCssVariable('--color-graph-scroll-marker-upstream', computedStyle),
				'--scroll-marker-highlights-color': getCssVariable(
					'--color-graph-scroll-marker-highlights',
					computedStyle,
				),
				'--scroll-marker-local-branches-color': getCssVariable(
					'--color-graph-scroll-marker-local-branches',
					computedStyle,
				),
				'--scroll-marker-remote-branches-color': getCssVariable(
					'--color-graph-scroll-marker-remote-branches',
					computedStyle,
				),
				'--scroll-marker-stashes-color': getCssVariable('--color-graph-scroll-marker-stashes', computedStyle),
				'--scroll-marker-tags-color': getCssVariable('--color-graph-scroll-marker-tags', computedStyle),
				'--scroll-marker-selection-color': getCssVariable(
					'--color-graph-scroll-marker-selection',
					computedStyle,
				),
				'--scroll-marker-pull-requests-color': getCssVariable(
					'--color-graph-scroll-marker-pull-requests',
					computedStyle,
				),

				'--stats-added-color': getCssVariable('--color-graph-stats-added', computedStyle),
				'--stats-deleted-color': getCssVariable('--color-graph-stats-deleted', computedStyle),
				'--stats-files-color': getCssVariable('--color-graph-stats-files', computedStyle),
				'--stats-bar-border-radius': getCssVariable('--graph-stats-bar-border-radius', computedStyle),
				'--stats-bar-height': getCssVariable('--graph-stats-bar-height', computedStyle),

				'--text-selected': getCssVariable('--color-graph-text-selected', computedStyle),
				'--text-selected-row': getCssVariable('--color-graph-text-selected-row', computedStyle),
				'--text-hovered': getCssVariable('--color-graph-text-hovered', computedStyle),
				'--text-dimmed-selected': getCssVariable('--color-graph-text-dimmed-selected', computedStyle),
				'--text-dimmed': getCssVariable('--color-graph-text-dimmed', computedStyle),
				'--text-normal': getCssVariable('--color-graph-text-normal', computedStyle),
				'--text-secondary': getCssVariable('--color-graph-text-secondary', computedStyle),
				'--text-disabled': getCssVariable('--color-graph-text-disabled', computedStyle),

				'--text-accent': getCssVariable('--color-link-foreground', computedStyle),
				'--text-inverse': getCssVariable('--vscode-input-background', computedStyle),
				'--text-bright': getCssVariable('--vscode-input-background', computedStyle),
				...mixedGraphColors,
			},
			themeOpacityFactor: parseInt(getCssVariable('--graph-theme-opacity-factor', computedStyle)) || 1,
		};
	}

	private onGetMissingAvatars(emails: GraphAvatars) {
		this._ipc.sendCommand(GetMissingAvatarsCommand, { emails: emails });
	}

	private onGetMissingRefsMetadata(metadata: GraphMissingRefsMetadata) {
		this._ipc.sendCommand(GetMissingRefsMetadataCommand, { metadata: metadata });
	}

	private onGetMoreRows(sha?: string) {
		this._ipc.sendCommand(GetMoreRowsCommand, { id: sha });
	}

	private onColumnsChanged(settings: GraphColumnsConfig) {
		this._ipc.sendCommand(UpdateColumnsCommand, {
			config: settings,
		});
	}

	private onRefsVisibilityChanged({ refs, visible }: { refs: GraphExcludedRef[]; visible: boolean }) {
		this._ipc.sendCommand(UpdateRefsVisibilityCommand, {
			refs: refs,
			visible: visible,
		});
	}

	private onDoubleClickRef({ ref, metadata }: { ref: GraphRef; metadata?: GraphRefMetadataItem }) {
		this._ipc.sendCommand(DoubleClickedCommandType, {
			type: 'ref',
			ref: ref,
			metadata: metadata,
		});
	}

	private onDoubleClickRow({ row, preserveFocus }: { row: GraphRow; preserveFocus?: boolean }) {
		this._ipc.sendCommand(DoubleClickedCommandType, {
			type: 'row',
			row: { id: row.sha, type: row.type as GitGraphRowType },
			preserveFocus: preserveFocus,
		});
	}

	private onGraphConfigurationChanged(changes: UpdateGraphConfigurationParams['changes']) {
		this._ipc.sendCommand(UpdateGraphConfigurationCommand, { changes: changes });
	}

	private onGraphSearchModeChanged(searchMode: GraphSearchMode) {
		this._ipc.sendCommand(UpdateGraphSearchModeCommand, { searchMode: searchMode });
	}

	private onSelectionChanged(rows: GraphRow[]) {
		const selection = rows.filter(r => r != null).map(r => ({ id: r.sha, type: r.type as GitGraphRowType }));
		// this._telemetry.sendEvent({ name: 'graph/row/selected', data: { rows: selection.length } });

		// hover.current?.hide();

		const active = rows[rows.length - 1];
		const activeKey = active != null ? `${active.sha}|${active.date}` : undefined;
		// HACK: Ensure the main state is updated since it doesn't come from the extension
		// state.activeRow = activeKey;
		// setActiveRow(activeKey);
		this.graphAppState.activeRow = activeKey;
		this.graphAppState.activeDay = active?.date;

		this._ipc.sendCommand(UpdateSelectionCommand, {
			selection: selection,
		});
	}

	private onHoverRowPromise(row: GraphRow) {
		// try {
		// 	const request = await this.sendRequest(GetRowHoverRequest, {
		// 		type: row.type as GitGraphRowType,
		// 		id: row.sha,
		// 	});
		// 	this._telemetry.sendEvent({ name: 'graph/row/hovered', data: {} });
		// 	return request;
		// } catch (ex) {
		// 	return { id: row.sha, markdown: { status: 'rejected' as const, reason: ex } };
		// }
	}

	protected override updated(_changedProperties: PropertyValues): void {
		forEach(_changedProperties.keys(), key => console.log('change', key));
	}

	@query('web-graph')
	webGraph!: typeof WebGraph;

	selectCommits(shaList: string[], includeToPrevSel: boolean, isAutoOrKeyScroll: boolean) {
		console.log('webGraph', this.webGraph, shaList);
		this.ref?.selectCommits(shaList, includeToPrevSel, isAutoOrKeyScroll);
	}

	onChangeVisibleDays(args) {
		this.dispatchEvent(new CustomEvent('gl-graph-change-visible-days', { detail: args }));
	}

	@consume({ context: graphStateContext })
	private graphAppState!: typeof graphStateContext.__context__;

	private ref?: GraphContainer;

	override render() {
		console.log('graph state parent ', this._state.rows);

		return html`<web-graph
			.avatars=${this._state.avatars ?? {}}
			.columns=${this._state.columns ?? {}}
			.context=${this._state.context ?? {}}
			.theming=${this.graphAppState.theming ?? {}}
			.config=${this._state.config ?? {}}
			.downstreams=${this._state.downstreams ?? {}}
			.excludeRefs=${this._state.excludeRefs ?? {}}
			.excludeTypes=${this._state.excludeTypes ?? {}}
			.rows=${this._state.rows ?? []}
			.includeOnlyRefs=${this._state.includeOnlyRefs ?? {}}
			?windowFocused=${this._state.windowFocused}
			?loading=${this._state.loading}
			.selectedRows=${this._state.selectedRows ?? {}}
			nonce=${ifDefined(this._state.nonce)}
			.refsMetadata=${this._state.refsMetadata ?? {}}
			.rowsStats=${this._state.rowsStats ?? {}}
			.workingTreeStats=${this._state.workingTreeStats ?? {}}
			.paging=${this._state.paging ?? {}}
			.setRef=${(ref: GraphContainer) => {
				this.ref = ref;
			}}
			@changecolumns=${$w(this.onColumnsChanged.bind(this))}
			@changegraphconfiguration=${$w(this.onGraphConfigurationChanged.bind(this))}
			@changegraphsearchmode=${$w(this.onGraphSearchModeChanged.bind(this))}
			@changerefsvisibility=${$w(this.onRefsVisibilityChanged.bind(this))}
			@changeselection=${$w(this.onSelectionChanged.bind(this))}
			@doubleclickref=${$w(this.onDoubleClickRef.bind(this))}
			@doubleclickrow=${$w(this.onDoubleClickRow.bind(this))}
			@hoverrowpromise=${$w(this.onHoverRowPromise.bind(this))}
			@missingavatars=${$w(this.onGetMissingAvatars.bind(this))}
			@missingrefsmetadata=${$w(this.onGetMissingRefsMetadata.bind(this))}
			@morerows=${$w(this.onGetMoreRows.bind(this))}
			@changevisibledays=${$w(this.onChangeVisibleDays.bind(this))}
		></web-graph>`;
	}
}
