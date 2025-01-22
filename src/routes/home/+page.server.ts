import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions, PageServerLoadEvent } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async (event: PageServerLoadEvent) => {
	if (!event.locals.user) {
		return redirect(302, '/');
	}
	return { user: event.locals.user };
};

export const actions: Actions = {
	upload: async (event) => {
		const currentUser = event.locals.user?.id;

		if (!currentUser) {
			return fail(401, { message: 'Not authenticated' });
		}

		const formData = await event.request.formData();
		const file = formData.get('file') as File;

		if (!file || !(file instanceof File)) {
			return fail(400, { message: 'No file uploaded' });
		}

		// Sanitize file name
		const sanitizedFileName = path.basename(file.name).replace(/[^a-zA-Z0-9.\-_]/g, '_');

		// Get file type
		const fileType = file.type;

		// Validate file type
		const allowedTypes = [
			'application/zip',
			'application/x-rar-compressed',
			'application/x-tar',
			'application/gzip',
			'audio/mpeg',
			'audio/wav',
			'audio/ogg',
			'audio/opus',
			'image/jpeg',
			'image/png',
			'image/gif',
			'image/bmp',
			'image/tiff',
			'image/svg+xml',
			'image/webp',
			'text/css',
			'text/html',
			'application/x-httpd-php',
			'text/x-c',
			'text/x-c++',
			'text/x-h',
			'text/x-h++',
			'application/javascript',
			'text/x-java-source',
			'text/x-python',
			'text/plain',
			'video/webm',
			'video/mp4',
			'video/3gpp',
			'video/quicktime',
			'video/x-msvideo',
			'video/mpeg',
			'video/x-ms-wmv',
			'video/x-flv',
			'video/ogg'
		];
		if (!fileType || !allowedTypes.includes(fileType)) {
			return fail(400, { message: 'Invalid file type' });
		}

		// Validate file size
		const maxSize = 100 * 1024 * 1024; // 100MB
		if (file.size > maxSize) {
			return fail(400, { message: 'File size exceeds the limit of 100MB' });
		}

		const homeDir = os.homedir();
		const uploadDir = path.join(homeDir, 'AppStorage', currentUser);
		const filePath = path.join(uploadDir, sanitizedFileName);

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Ensure the upload directory exists
		try {
			await fs.promises.mkdir(uploadDir, { recursive: true });
		} catch (err) {
			console.error('Failed to create directory:', err);
			return fail(500, { message: 'Failed to create directory' });
		}

		// Write the file to disk
		try {
			await fs.promises.writeFile(filePath, buffer);
			console.log(`File uploaded to ${filePath}`);
			return { success: true, message: 'File uploaded!' };
		} catch (err) {
			console.error(err);
			return fail(500, { message: 'Failed to write file' });
		}
	}
};
