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
