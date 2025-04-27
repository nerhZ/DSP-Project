import { json } from '@sveltejs/kit';
import type { RequestHandler, RequestEvent } from '@sveltejs/kit';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import archiver from 'archiver';
import { db } from '$lib/server/db';
import type { CheckedItem } from '$lib/types';
import { eq, and } from 'drizzle-orm';
import * as table from '$lib/server/db/schema';

export const POST: RequestHandler = async (event: RequestEvent) => {
	const currentUser = event.locals.session?.userId;

	if (!currentUser) {
		return json({ message: 'Not authenticated, please login again' }, { status: 401 });
	}

	let itemsToDownload: CheckedItem[] = [];
	try {
		const requestBody = await event.request.json();
		if (!requestBody.items || !Array.isArray(requestBody.items)) {
			throw new Error('Invalid request body: "items" array not found.');
		}
		itemsToDownload = requestBody.items as CheckedItem[];

		if (itemsToDownload.length === 0) {
			return json({ message: 'No items specified for download.' }, { status: 400 });
		}
	} catch (err) {
		console.error('Error parsing JSON or validating request body:', err);
		return json(
			{ body: { message: 'A server error occurred while creating the download.' } },
			{ status: 400 }
		);
	}

	const storageRoot = path.join('/mnt', 'AppStorage');
	// Create a unique temporary directory name
	const tempDir = path.join(storageRoot, `${currentUser}-temp-download-${Date.now()}`);
	const zipFilePath = path.join(tempDir, 'download.zip');

	let output: fs.WriteStream | null = null;
	const archive = archiver('zip', { zlib: { level: 3 } }); // Compression level (0-9)

	let streamClosed = false;
	try {
		// Create temp dir
		await fsp.mkdir(tempDir, { recursive: true });

		output = fs.createWriteStream(zipFilePath);

		// Listen for the 'close' event to know when the file is fully written
		const streamClosePromise = new Promise<void>((resolve, reject) => {
			output?.on('close', () => {
				console.log(`Zip stream closed. Total bytes written: ${archive.pointer()}`);
				streamClosed = true;
				resolve();
			});
			output?.on('error', (err) => {
				console.error('Write stream error:', err);
				streamClosed = true; // Consider it closed on error too
				reject(new Error('Failed to write zip file to disk.'));
			});
			archive.on('error', (err) => {
				console.error('Archiver error:', err);
				// Abort can help stop processing, but stream might still be open/erroring
				archive.abort();
				reject(new Error(`Failed to create archive: ${err.message}`));
			});
		});

		archive.pipe(output);

		let itemsAdded = 0;
		for (const item of itemsToDownload) {
			try {
				if (item.type === 'file') {
					const fileIdAsNumber = typeof item.id === 'string' ? parseInt(item.id, 10) : item.id;
					if (isNaN(fileIdAsNumber)) {
						console.warn(`Invalid file ID format: ${item.id} for item ${item.name}`);
						continue;
					}

					const fileData = await db
						.select({ URI: table.user_file.URI })
						.from(table.user_file)
						.where(
							and(eq(table.user_file.id, fileIdAsNumber), eq(table.user_file.userId, currentUser))
						)
						.limit(1);

					if (fileData.length > 0) {
						const fileURI = fileData[0].URI;
						const filePath = path.join(storageRoot, fileURI);
						// Path inside the zip, relative to user's root
						const zipEntryName = fileURI.substring(currentUser.length + 1);

						try {
							await fsp.access(filePath, fs.constants.R_OK); // Check existence and read permission
							// Add file using its relative path within the user's storage as the name inside the zip
							archive.file(filePath, { name: zipEntryName });
							itemsAdded++;
							console.log(`Adding file to zip: ${zipEntryName} (Source: ${filePath})`);
						} catch (fsErr) {
							console.warn(`File not accessible or not found, skipping: ${filePath}`, fsErr);
						}
					} else {
						console.warn(
							`File not found in DB or access denied: ID ${item.id}, Name: ${item.name}`
						);
					}
				} else if (item.type === 'folder') {
					// Assuming folder.id is string, adjust if needed
					const folderId = item.id as string;

					const folderData = await db
						.select({ URI: table.folder.URI })
						.from(table.folder)
						.where(and(eq(table.folder.id, folderId), eq(table.folder.userId, currentUser)))
						.limit(1);

					if (folderData.length > 0) {
						const folderURI = folderData[0].URI;
						const folderPath = path.join(storageRoot, folderURI);
						// Path inside the zip, relative to user's root
						const zipEntryPath = folderURI.substring(currentUser.length + 1);

						try {
							await fsp.access(folderPath, fs.constants.R_OK); // Check existence and read permission
							// Add directories to mirror app structure
							archive.directory(folderPath, zipEntryPath);
							itemsAdded++;
							console.log(`Adding folder to zip: ${zipEntryPath} (Source: ${folderPath})`);
						} catch (fsErr) {
							console.warn(`Folder not accessible or not found, skipping: ${folderPath}`, fsErr);
						}
					} else {
						console.warn(
							`Folder not found in DB or access denied: ID ${item.id}, Name: ${item.name}`
						);
					}
				} else {
					console.warn(
						`Unknown item type: ${item.type} for item ID ${item.id}, Name: ${item.name}`
					);
				}
			} catch (dbOrFsError) {
				console.error(
					`Error processing item ID ${item.id} (Type: ${item.type}, Name: ${item.name}):`,
					dbOrFsError
				);
			}
		}

		if (itemsAdded === 0) {
			// If no items were found or accessible, abort and return error
			archive.abort();
			throw new Error('Could not find any valid items to download.');
		}

		// Signal that no more files will be added
		await archive.finalize();

		// Wait for the stream to close completely
		await streamClosePromise;

		// Read the created zip file and encode it
		const zipBase64 = await fsp.readFile(zipFilePath, 'base64');

		return json({
			body: {
				data: {
					fileContent: zipBase64,
					fileName: 'download.zip'
				}
			}
		});
	} catch (err) {
		// Catch errors from setup, finalization, reading zip, or the "No valid items" error
		console.error('Error creating zip archive:', err);
		// Ensure stream is closed if it exists and wasn't closed
		if (output && !streamClosed) {
			console.log('Attempting to close output stream after error...');
			await new Promise<void>((resolve) => {
				output?.end(() => resolve()); // Attempt to close gracefully
			});
		}
		return json(
			{
				body: { message: 'A server error occurred while creating the download.' }
			},
			{ status: 500 }
		);
	} finally {
		// Cleanup temp directory regardless of success or failure
		console.log(`Cleaning up temporary directory: ${tempDir}`);
		await fsp.rm(tempDir, { recursive: true, force: true }).catch((cleanupErr) => {
			console.error('Error cleaning up temporary download directory:', cleanupErr);
		});
	}
};
