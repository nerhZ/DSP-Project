import mime from 'mime';

export function base64ToBlobAndURL(base64: string, fileName: string): { blob: Blob; url: string } {
	// Remove the data URL prefix if present
	const base64Data = base64.split(',')[1] || base64;

	// Convert Base64 to binary
	const byteCharacters = atob(base64Data);
	const byteNumbers = new Array(byteCharacters.length);

	for (let i = 0; i < byteCharacters.length; i++) {
		byteNumbers[i] = byteCharacters.charCodeAt(i);
	}

	const byteArray = new Uint8Array(byteNumbers);

	const mimeType = mime.getType(fileName) || 'application/octet-stream';

	// Create a Blob from the binary data
	const blob = new Blob([byteArray], { type: mimeType });

	return { blob: blob, url: URL.createObjectURL(blob) };
}

export function capitalise(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

export function debounce(func: (...args: any[]) => Promise<void>, wait: number) {
	let timeout: NodeJS.Timeout | null = null;
	return (...args: any[]) => {
		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(() => {
			func(...args);
			timeout = null;
		}, wait);
	};
}

export function sanitizePathSegment(name: string): string {
	return name
		.trim()
		.replace(/\s+/g, '_')
		.replace(/[^a-zA-Z0-9.\-_]/g, '');
}

// Helper function to parse and validate dates
export function parseAndValidateDateRange(
	startDateStr: string | null,
	endDateStr: string | null
): { start: Date; end: Date } | null {
	if (!startDateStr || !endDateStr) {
		return null;
	}
	try {
		const start = new Date(startDateStr);
		const end = new Date(endDateStr);
		// Ensure dates are valid before using them
		if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
			start.setHours(0, 0, 0, 0); // Start of the start day
			end.setHours(23, 59, 59, 999); // End of the end day
			if (start <= end) {
				// Ensure start is not after end
				return { start, end };
			} else {
				console.warn('Start date is after end date, ignoring date filter.');
				return null;
			}
		} else {
			console.warn('Invalid start or end date received, ignoring date filter.');
			return null;
		}
	} catch (dateError) {
		console.error('Error processing date filter:', dateError);
		return null;
	}
}
