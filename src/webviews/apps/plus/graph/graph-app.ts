import type { CssVariables, GraphRow } from '@gitkraken/gitkraken-components';
import { css, html } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
/*global document window*/
import '@shoelace-style/shoelace/dist/components/option/option.component.js';
import '@shoelace-style/shoelace/dist/components/select/select.component.js';
import { Color, getCssVariable, mix, opacity } from '../../../../system/color';
import type { GraphExcludedRef, State } from '../../../plus/graph/protocol';
import { OpenPullRequestDetailsCommand, UpdateRefsVisibilityCommand } from '../../../plus/graph/protocol';
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
import type { ThemeChangeEvent } from '../../shared/theme';
import '../shared/components/merge-rebase-status';
import './actions/gitActionsButtons.wc';
import './graph-header';
import type { GLGraphWrapper } from './graph-wrapper';
import './graph.scss';
import graphStyles from './graph.scss?lit';
import type { GlGraphMinimapContainer } from './minimap/minimap-container';
import './sidebar/sidebar';
import { GraphStateProvider } from './stateProvider';
import { GlElement } from '../../shared/components/element';
import { consume } from '@lit/context';
import { stateContext } from './context';
import type { GraphMinimapDaySelectedEventDetail } from './minimap/minimap';

@customElement('gl-graph-app-wc')
export class GraphAppWC extends GlElement {
	@consume({ context: stateContext, subscribe: true })
	state!: typeof stateContext.__context__;

	@state()
	searching: string = '';

	static override styles = [
		graphStyles,
		css`
			main {
				display: flex;
				height: 100%;
			}
			gl-graph-wrapper {
				flex: 1;
			}
		`,
	];

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

		// queueMicrotask(
		// 	() =>
		// 		e.target &&
		// 		emitTelemetrySentEvent<'graph/minimap/day/selected'>(e.target, {
		// 			name: 'graph/minimap/day/selected',
		// 			data: {},
		// 		}),
		// );
	}

	@state()
	visibleDays?: { top: number; bottom: number };

	private handleOnGraphVisibleRowsChanged = (top: GraphRow, bottom: GraphRow) => {
		this.visibleDays = {
			top: new Date(top.date).setHours(23, 59, 59, 999),
			bottom: new Date(bottom.date).setHours(0, 0, 0, 0),
		};
	};

	@query('gl-graph-minimap-container')
	minimapEl!: GlGraphMinimapContainer;

	@query('gl-graph-wrapper')
	graphEl!: GLGraphWrapper;

	override render() {
		console.log('activeDay', this.state.activeDay, this.state.visibleDays);
		return html`<gl-graph-header></gl-graph-header
			><gl-graph-minimap-container
				.activeDay=${this.state.activeDay}
				.disabled=${!this.state.config?.minimap}
				.rows=${this.state.rows ?? []}
				.rowsStats=${this.state.rowsStats}
				.dataType=${this.state.config?.minimapDataType ?? 'commits'}
				.markerTypes=${this.state.config?.minimapMarkerTypes ?? []}
				.refMetadata=${this.state.refsMetadata}
				.searchResults=${this.state.searchResults}
				.visibleDays=${this.state.visibleDays}
				@gl-graph-minimap-selected=${e => this.handleOnMinimapDaySelected(e)}
			></gl-graph-minimap-container>
			<gl-graph-hover id="commit-hover" distance=${0} skidding=${15}></gl-graph-hover>
			<main id="main" className="graph-app__main">
				<gl-graph-sidebar></gl-graph-sidebar
				><gl-graph-wrapper
					@gl-graph-change-visible-days=${e => {
						console.log('activeday', e);
						this.state.visibleDays = e.detail;
					}}
				></gl-graph-wrapper>
			</main>`;
	}
}

new GraphAppWC();
