declare module '*.scss?lit' {
	import { CSSResult } from 'lit';
	declare const CSSResultInstance: CSSResult;

	export default CSSResultInstance;
}
