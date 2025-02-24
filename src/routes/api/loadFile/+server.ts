import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'node:fs';
import path from 'node:path';

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
		const fileName = requestBody.file;

		if (!fileName || typeof fileName !== 'string') {
			return json(
				{
					body: { message: 'No file specified for loading, please try again' }
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

		const filePath = path.join(userDir, fileName);

		try {
			const chosenFile = await fs.promises.readFile(filePath, 'base64');
			return json({
				body: {
					data: { fileContent: chosenFile, fileName: fileName }
				}
			});
		} catch (err) {
			console.error(err);
			return json(
				{
					body: { message: 'Failed to read file! Please try again or refresh.' }
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
