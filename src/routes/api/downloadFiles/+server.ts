import { json } from '@sveltejs/kit';
import type { RequestHandler, RequestEvent } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';

export const POST: RequestHandler = async (event: RequestEvent) => {
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
		const fileNames = requestBody.files;

		if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
			return json(
				{
					body: { message: 'No files specified for loading, please try again' }
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
			const zip = archiver('zip', {
				zlib: { level: 3 } // Sets the compression level.
			});

			const tempFilePath = path.join('/mnt', 'AppStorage', `${currentUser}temp`);
			const zipFilePath = path.join(tempFilePath, 'download.zip');
			await fs.promises.mkdir(tempFilePath, { recursive: true });
			const output = fs.createWriteStream(zipFilePath);

			zip.pipe(output);

			for (const file of fileNames) {
				const filePath = path.join(userDir, file);
				zip.append(fs.createReadStream(filePath), { name: file });
			}

			await zip.finalize();

			// Wait for the file to be fully written to the disk - await zip.finalize can still be unfinished
			await new Promise((resolve, reject) => {
				output.on('close', resolve);
				output.on('error', reject);
			});

			const zipBase64 = fs.readFileSync(zipFilePath, 'base64');
			fs.rmdirSync(tempFilePath, { recursive: true }); // Clean up the temp directory

			return json({
				body: {
					data: {
						fileContent: zipBase64,
						fileName: 'download.zip'
					}
				}
			});
		} catch (err) {
			console.error(err);
			return json(
				{
					body: { message: 'Failed to read files! Please try again or refresh.' }
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
