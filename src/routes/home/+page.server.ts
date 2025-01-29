import type { PageServerLoad, Actions, PageServerLoadEvent } from './$types';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
// import * as auth from '$lib/server/auth';
import { count, eq, and, like } from 'drizzle-orm';

export const load: PageServerLoad = async (event: PageServerLoadEvent) => {
	const session = event.locals.session;

	if (!session || !session.userId) {
		return fail(401, { message: 'Not authenticated - please try login again.' });
	}

	const userDir = path.join('/mnt', 'AppStorage', session.userId);

	let files: { name: string; data: string }[] = [];
	try {
		const folderExists = fs.existsSync(userDir);
		if (!folderExists) {
			return;
		}

		const dirFiles = await fs.promises.readdir(userDir);
		// Read each file's content
		for (const file of dirFiles) {
			const filePath = path.join(userDir, file);
			const data = await fs.promises.readFile(filePath, 'base64');
			files.push({ name: file, data });
		}
		return { files };
	} catch (err) {
		fail(500, { message: 'Failed to read user directory' });
	}
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

		// Validate file size
		const maxSize = 100 * 1024 * 1024; // 100MB
		if (file.size > maxSize) {
			return fail(400, { message: 'File size exceeds the limit of 100MB' });
		}

		// Get file type
		const mimetype = file.type.split('/')[0];
		const extension = file.type.split('/')[1];

		// Validate file type
		const allowedTypes = [
			'application/zip',
			'application/x-rar-compressed',
			'application/x-tar',
			'application/gzip',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'application/msword',
			'application/pdf',
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
		if (!file.type || !allowedTypes.includes(file.type)) {
			return fail(400, { message: 'Invalid file type' });
		}

		// Sanitize file name
		let sanitizedFileName = path.basename(file.name).replace(/[^a-zA-Z0-9.\-_]/g, '_');

		let filenameType = path.extname(sanitizedFileName);
		let filenameBase = path.basename(sanitizedFileName, filenameType);

		// Check if file name is already in use
		const existingFile = await db
			.select({ count: count() })
			.from(table.user_file)
			.where(
				and(
					eq(table.user_file.userId, currentUser),
					like(table.user_file.filename, `${filenameBase}%`)
				)
			);

		if (existingFile[0].count > 0) {
			sanitizedFileName = `${filenameBase}-${existingFile[0].count}${filenameType}`;
		}

		const uploadDir = path.join('/mnt', 'AppStorage', currentUser);
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
			// In case name change resulted in duplicate file name
			const fileExists = fs.existsSync(filePath);
			if (fileExists) {
				return fail(400, { message: 'File already exists, please alter file name' });
			}

			await fs.promises.writeFile(filePath, buffer);
			await db.insert(table.user_file).values({
				userId: currentUser,
				filename: sanitizedFileName,
				extension: extension,
				mimetype: mimetype,
				uploadedAt: new Date(),
				fileSize: file.size
			});

			return { success: true, message: 'File uploaded!' };
		} catch (err) {
			// If error occured, db insert definitely failed so ensure file is deleted
			await fs.promises.unlink(filePath);
			console.error(err);
			return fail(500, { message: 'Failed to write file' });
		}
	},
	delete: async (event) => {
		const currentUser = event.locals.session?.userId;

		if (!currentUser) {
			return fail(401, { message: 'Not authenticated, please login again' });
		}

		const formData = await event.request.formData();
		const fileName = formData.get('file');

		if (!fileName || typeof fileName !== 'string') {
			return fail(400, { message: 'No file specified for deletion, please try again' });
		}

		const filePath = path.join('/mnt', 'AppStorage', currentUser, fileName);

		try {
			await db
				.delete(table.user_file)
				.where(
					and(eq(table.user_file.userId, currentUser), eq(table.user_file.filename, fileName))
				);

			await fs.promises.unlink(filePath);

			return { success: true, message: 'File deleted!' };
		} catch (err) {
			console.error(err);
			return fail(500, { message: 'Failed to delete file! Please try again or refresh.' });
		}
	}
};
