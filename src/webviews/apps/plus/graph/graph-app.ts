import { consume } from '@lit/context';
import { SignalWatcher } from '@lit-labs/signals';
import { html, LitElement } from 'lit';
import { customElement, query } from 'lit/decorators.js';
import '@shoelace-style/shoelace/dist/components/option/option.component.js';
import '@shoelace-style/shoelace/dist/components/select/select.component.js';
import '../../shared/components/branch-icon';
import '../../shared/components/button';
import '../../shared/components/code-icon';
import '../../shared/components/menu';
import '../../shared/components/overlays/popover';
import '../../shared/components/overlays/tooltip';
import '../../shared/components/rich/issue-pull-request';
import { emitTelemetrySentEvent } from '../../shared/telemetry';
import '../shared/components/merge-rebase-status';
import './actions/gitActionsButtons.wc';
import { stateContext } from './context';
import './graph-header';
import type { GLGraphWrapper } from './graph-wrapper';
import './graph.scss';
import type { GraphMinimapDaySelectedEventDetail } from './minimap/minimap';
import type { GlGraphMinimapContainer } from './minimap/minimap-container';
import './sidebar/sidebar';
import type { GraphAppState } from './stateProvider';
import { graphStateContext } from './stateProvider';

@customElement('gl-graph-app-wc')
export class GraphAppWC extends SignalWatcher(LitElement) {
	protected override createRenderRoot(): HTMLElement | DocumentFragment {
		return this;
	}

	@consume({ context: stateContext, subscribe: true })
	state!: typeof stateContext.__context__;

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

	// private async onEnsureRowPromise(id: string, select: boolean) {
	// 	try {
	// 		return await this.sendRequest(EnsureRowRequest, { id: id, select: select });
	// 	} catch {
	// 		return undefined;
	// 	}
	// }

	// private updateSearchResultState(params: DidSearchParams) {
	// 	this.state.searchResults = params.results;
	// 	if (params.selectedRows != null) {
	// 		this.state.selectedRows = params.selectedRows;
	// 	}
	// 	this.setState(this.state, DidSearchNotification);
	// }

	private handleOnMinimapDaySelected(e: CustomEvent<GraphMinimapDaySelectedEventDetail>) {
		if (!this.state.rows) {
			return;
		}
		let { sha } = e.detail;
		if (sha == null) {
			const date = e.detail.date?.getTime();
			if (date == null) return;

			// Find closest row to the date
			const closest = this.state.rows.reduce((prev, curr) =>
				Math.abs(curr.date - date) < Math.abs(prev.date - date) ? curr : prev,
			);
			sha = closest.sha;
		}

		this.graphEl.selectCommits([sha], false, true);

		queueMicrotask(
			() =>
				e.target &&
				emitTelemetrySentEvent<'graph/minimap/day/selected'>(e.target, {
					name: 'graph/minimap/day/selected',
					data: {},
				}),
		);
	}

	@query('gl-graph-minimap-container')
	minimapEl!: GlGraphMinimapContainer;

	@query('gl-graph-wrapper')
	graphEl!: GLGraphWrapper;

	@consume({ context: graphStateContext, subscribe: true })
	graphApp!: typeof graphStateContext.__context__;

	private handleSetVisibleDays(e: CustomEvent<GraphAppState['visibleDays']>) {
		this.graphApp.visibleDays = e.detail;
	}

	@query('gl-graph-wrapper')
	graphWrapper!: GLGraphWrapper;

	private handleHeaderSearchNavigation(e: CustomEvent<string>) {
		this.graphWrapper.selectCommits([e.detail], false, true);
	}

	override render() {
		return html`<gl-graph-header @gl-select-commits=${this.handleHeaderSearchNavigation}></gl-graph-header
			><gl-graph-minimap-container
				.activeDay=${this.graphApp.activeDay}
				.disabled=${!this.state.config?.minimap}
				.rows=${this.state.rows ?? []}
				.rowsStats=${this.state.rowsStats}
				.dataType=${this.state.config?.minimapDataType ?? 'commits'}
				.markerTypes=${this.state.config?.minimapMarkerTypes ?? []}
				.refMetadata=${this.state.refsMetadata}
				.searchResults=${this.state.searchResults}
				@gl-graph-minimap-selected=${this.handleOnMinimapDaySelected}
				.visibleDays=${this.graphApp.visibleDays}
			></gl-graph-minimap-container>
			<gl-graph-hover id="commit-hover" distance=${0} skidding=${15}></gl-graph-hover>
			<main id="main" class="graph-app__main">
				<gl-graph-sidebar></gl-graph-sidebar
				><gl-graph-wrapper @gl-graph-change-visible-days=${this.handleSetVisibleDays}></gl-graph-wrapper>
			</main>`;
	}
}

new GraphAppWC();
