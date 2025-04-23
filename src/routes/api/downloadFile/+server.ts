import { json } from '@sveltejs/kit';
import type { RequestHandler, RequestEvent } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: RequestHandler = async (event: RequestEvent) => {
	const currentUser = event.locals.session?.userId;

	if (!currentUser) {
		// Consistent JSON structure for errors
		return json({ message: 'Not authenticated, please login again' }, { status: 401 });
	}

	let fileId: number | undefined;

	try {
		const requestBody = await event.request.json();
		fileId = requestBody.file;
		console.log(fileId);

		if (!fileId || typeof fileId !== 'number') {
			return json({ message: 'No file ID specified for loading.' }, { status: 400 });
		}
	} catch (err) {
		console.error('Error parsing JSON:', err);
		return json({ message: 'Invalid JSON format in request body' }, { status: 400 });
	}

	try {
		const fileResult = await db
			.select({
				uri: table.user_file.URI,
				filename: table.user_file.filename
			})
			.from(table.user_file)
			.where(and(eq(table.user_file.id, fileId), eq(table.user_file.userId, currentUser))) // Check both ID and user ownership
			.limit(1);

		if (fileResult.length === 0) {
			return json({ message: 'File not found or access denied.' }, { status: 404 });
		}

		const fileRecord = fileResult[0];
		const fileDbUri = fileRecord.uri;
		const originalFileName = fileRecord.filename;

		const storageRoot = path.join('/mnt', 'AppStorage');
		// Construct the full absolute path using the storage root and the URI from the DB
		const absoluteFilePath = path.join(storageRoot, fileDbUri);

		// Read the file content
		const fileContentBase64 = await fs.promises.readFile(absoluteFilePath, 'base64');

		// Return the file content and original filename
		return json({
			body: {
				data: { fileContent: fileContentBase64, fileName: originalFileName }
			}
		});
	} catch (err: any) {
		// Catch potential DB errors or other unexpected errors
		console.error('Error processing file download:', err);
		// Avoid leaking specific error details unless necessary
		if (err.code === 'ENOENT') {
			// Specific check if readFile itself failed because file disappeared
			return json({ message: 'File not found on server during read.' }, { status: 500 });
		}
		return json({ message: 'Failed to process file download.' }, { status: 500 });
	}
};
