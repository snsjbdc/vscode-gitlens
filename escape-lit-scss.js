module.exports = function (source) {
	const regex = /content: ["|']((?:\\\w+\s*)+)+["|']/gi;

	let match;
	let stripedOutStyle = source;

	while ((match = regex.exec(source)) !== null) {
		// This is necessary to avoid infinite loops with zero-width matches
		if (match.index === regex.lastIndex) {
			regex.lastIndex++;
		}

		// We need stipeOut each part of content value (e.g. 'content: \2014 \00A0";')
		const stripedMatchValue = match[1]
			.split(' ')
			.map(part => `\\${part}`)
			.join(' ');

		stripedOutStyle = stripedOutStyle.replace(match[0], `content: "${stripedMatchValue}";`);
	}

	return stripedOutStyle;
};
