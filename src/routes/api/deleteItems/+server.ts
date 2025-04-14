import { json } from '@sveltejs/kit';
import type { RequestHandler, RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import type { CheckedItem } from '$lib/types';
import fsp from 'node:fs/promises';
import path from 'node:path';

// POST method for deleting items
export const POST: RequestHandler = async (event: RequestEvent) => {
	const currentUser = event.locals.session?.userId;

	if (!currentUser) {
		return json({ message: 'Not authenticated, please login again' }, { status: 401 });
	}

	let itemsToDelete: CheckedItem[] = [];
	try {
		const requestBody = await event.request.json();
		if (!requestBody.items || !Array.isArray(requestBody.items)) {
			throw new Error('Invalid request body: "items" array not found.');
		}
		itemsToDelete = requestBody.items as CheckedItem[];

		if (itemsToDelete.length === 0) {
			return json({ message: 'No items specified for deletion.' }, { status: 400 });
		}
	} catch (err) {
		console.error('Error parsing JSON or validating request body:', err);
		return json({ message: err || 'Invalid JSON format in request body' }, { status: 400 });
	}

	const baseUserPath = path.join('/mnt', 'AppStorage', currentUser);
	const errors: { item: CheckedItem; error: string }[] = [];
	const successes: { item: CheckedItem; message: string }[] = [];

	// Ensure base user directory exists before proceeding
	try {
		await fsp.access(baseUserPath);
	} catch (err) {
		console.error(`User directory ${baseUserPath} does not exist or is inaccessible.`);
		return json({ message: 'User storage directory not found.' }, { status: 500 });
	}

	// Process deletions
	for (const item of itemsToDelete) {
		try {
			if (item.type === 'file') {
				const storageRoot = path.join('/mnt', 'AppStorage');

				// Fetch the file record including its URI
				const fileData = await db
					.select({ id: table.user_file.id, URI: table.user_file.URI })
					.from(table.user_file)
					.where(
						and(eq(table.user_file.id, item.id as number), eq(table.user_file.userId, currentUser))
					)
					.limit(1);

				if (fileData.length === 0) {
					console.warn(`File with ID ${item.id} not found or access denied.`);
					errors.push({ item, error: `File not found or access denied.` });
					continue;
				}
				const fileRecord = fileData[0];

				// Construct the correct absolute filesystem path
				const filePath = path.join(storageRoot, fileRecord.URI);

				// Delete DB record first (safer in case FS delete fails)
				try {
					await db.delete(table.user_file).where(eq(table.user_file.id, fileRecord.id));
					console.log(`Deleted DB record for file: ${item.name} (ID: ${item.id})`);

					try {
						await fsp.unlink(filePath);
						console.log(`Deleted file from filesystem: ${filePath}`);
						successes.push({ item, message: `Deleted file ${item.name}` });
					} catch (fsErr: any) {
						// Handle case where file is already gone (ENOENT) vs other FS errors
						if ((fsErr as NodeJS.ErrnoException).code === 'ENOENT') {
							console.log(`Filesystem file ${filePath} was already gone.`);
							successes.push({
								item,
								message: `Deleted file ${item.name} (FS path already removed)`
							});
						} else {
							// Log other FS errors and report failure
							console.error(
								`Deleted DB record for file ${item.name}, but failed to delete from filesystem ${filePath}:`,
								fsErr.message
							);
							errors.push({
								item,
								error: `DB record deleted, but failed to delete file from storage: ${fsErr.message}`
							});
						}
					}
				} catch (dbError: any) {
					console.error(`Error deleting file ${item.id} from DB:`, dbError);
					errors.push({ item, error: `Database error deleting file: ${dbError.message}` });
				}
			} else if (item.type === 'folder') {
				const folderId = item.id as string;
				const storageRoot = path.join('/mnt', 'AppStorage');

				// Find the folder's URI
				const folderData = await db
					.select({ URI: table.folder.URI })
					.from(table.folder)
					.where(and(eq(table.folder.id, folderId), eq(table.folder.userId, currentUser)))
					.limit(1);

				if (folderData.length === 0) {
					console.warn(`Folder with ID ${folderId} not found or access denied.`);
					errors.push({ item, error: `Folder not found or access denied.` });
					continue; // Skip to the next item
				}
				const folderURI = folderData[0].URI;

				// Construct the correct absolute filesystem path
				const folderPath = path.join(storageRoot, folderURI);

				// Delete the folder record from the DB (cascade handles children)
				console.log(`Attempting DB delete for folder: ${item.name} (ID: ${folderId})`);
				try {
					const deleteResult = await db
						.delete(table.folder)
						.where(and(eq(table.folder.id, folderId), eq(table.folder.userId, currentUser)))
						.returning({ id: table.folder.id }); // Use returning to confirm deletion

					if (deleteResult.length === 0) {
						console.warn(
							`Folder record ${folderId} not found in DB for deletion or access denied.`
						);
					} else {
						console.log(`Deleted folder record (ID: ${folderId}) and triggered DB cascade.`);
					}
				} catch (dbError: any) {
					console.error(`Error deleting folder ${folderId} from DB:`, dbError);
					errors.push({ item, error: `Database error deleting folder: ${dbError.message}` });
				}

				// Delete the folder
				console.log(`Attempting recursive FS delete for path: ${folderPath}`);
				try {
					await fsp.rm(folderPath, { recursive: true, force: true });
					console.log(`Successfully deleted filesystem folder: ${folderPath}`);
					if (!errors.some((e) => e.item.id === item.id && e.item.type === item.type)) {
						successes.push({ item, message: `Deleted folder ${item.name} and its contents` });
					} else {
						successes.push({
							item,
							message: `Filesystem folder ${item.name} cleaned up, but DB deletion had issues.`
						});
					}
				} catch (fsErr: any) {
					console.error(`Failed to delete directory ${folderPath} from filesystem:`, fsErr.message);
					if (!errors.some((e) => e.item.id === item.id && e.item.type === item.type)) {
						errors.push({
							item,
							error: `Failed to delete folder from storage: ${fsErr.message}`
						});
					} else {
						const existingError = errors.find(
							(e) => e.item.id === item.id && e.item.type === item.type
						);
						if (existingError) {
							existingError.error += `; Filesystem deletion also failed: ${fsErr.message}`;
						}
					}
				}
			} else {
				console.error(`Unknown item type "${item.type}" for item ${item.name}`);
				errors.push({ item, error: `Unknown item type "${item.type}"` });
			}
		} catch (err: any) {
			console.error(
				`Failed to process item ${item.name} (ID: ${item.id}, Type: ${item.type}):`,
				err
			);
			errors.push({ item, error: err.message || 'An unknown error occurred during processing.' });
		}
	}

	if (errors.length === 0 && successes.length > 0) {
		return json({ body: { message: `Successfully deleted ${successes.length} item(s).` } });
	} else if (errors.length > 0 && successes.length === 0) {
		// All failed or nothing to delete successfully
		return json(
			{ body: { message: `Failed to delete the selected item(s).`, errors } },
			{
				status: 500
			}
		);
	} else if (errors.length > 0 && successes.length > 0) {
		// Partial success
		return json(
			{
				body: {
					message: `Partially completed: Deleted ${successes.length} item(s), failed to delete ${errors.length} item(s).`,
					successes,
					errors
				}
			},
			{ status: 207 }
		);
	} else {
		// itemsToDelete was empty or all items were skipped (e.g., not found)
		if (itemsToDelete.length > 0 && errors.length === itemsToDelete.length) {
			return json(
				{
					body: {
						message: `Could not find or access any of the selected items for deletion.`,
						errors
					}
				},
				{ status: 404 }
			);
		}
		// Default fallback
		return json({ message: 'No items were processed for deletion.' }, { status: 400 });
	}
};
