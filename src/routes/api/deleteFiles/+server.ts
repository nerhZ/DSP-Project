import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';

// DELETE method causes CORS issues. Use POST method instead.
export const POST: RequestHandler = async (event) => {
	const currentUser = event.locals.session?.userId;

	if (!currentUser) {
		return json(
			{
				body: { message: 'Not authenticated, please login again' }
			},
			{ status: 401 }
		);
	}

	try {
		const requestBody = await event.request.json();
		const files = requestBody.files;

		if (!files) {
			return json(
				{
					body: { message: 'No file specified for deletion, please try again' }
				},
				{ status: 400 }
			);
		}

		const userDir = path.join('/mnt', 'AppStorage', currentUser);

		const folderExists = fs.existsSync(userDir);
		if (!folderExists) {
			return json(
				{
					body: { message: 'User directory does not exist' }
				},
				{ status: 500 }
			);
		}

		try {
			for (const file of files) {
				const filePath = path.join(userDir, file);

				// Delete file from database first - more likely to fail than file deletion
				await db.delete(table.user_file).where(eq(table.user_file.filename, file));

				await fs.promises.unlink(filePath);
			}

			return json({
				body: { message: 'Files deleted successfully!' }
			});
		} catch (err) {
			console.error(err);
			return json(
				{
					body: { message: 'Failed to delete file! Please try again or refresh.' }
				},
				{ status: 500 }
			);
		}
	} catch (err) {
		console.error('Error parsing JSON:', err);
		return json(
			{
				body: { message: 'Invalid JSON format in request body' }
			},
			{ status: 400 }
		);
	}
};
