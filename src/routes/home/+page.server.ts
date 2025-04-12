import type { PageServerLoad, Actions, PageServerLoadEvent } from './$types';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { count, eq, and, like, isNull } from 'drizzle-orm';
import { sanitizePathSegment } from '$lib/utils';

export const load: PageServerLoad = async (event: PageServerLoadEvent) => {
	const session = event.locals.session;

	if (!session || !session.userId) {
		return fail(401, { message: 'Not authenticated - please try login again.' });
	}

	// Get the folder ID from the URL
	const parentId = event.url.searchParams.get('folderId') || null;

	let pageSize = event.cookies.get('pageSize');
	let pageSizeInt: number;

	if (pageSize) {
		pageSizeInt = parseInt(pageSize);
	} else {
		pageSizeInt = 15;
	}

	try {
		// Filter conditions based on whether valid parentId is provided - for the folder table
		const parentFilter = parentId
			? eq(table.folder.parentFolderId, parentId)
			: isNull(table.folder.parentFolderId);

		// Filter condition based on whether valid parentId is provided - for the user_file table
		const fileParentFilter = parentId
			? eq(table.user_file.folderId, parentId)
			: isNull(table.user_file.folderId);

		// Fetch Folders for the current level
		const folders = await db
			.select()
			.from(table.folder)
			.where(and(eq(table.folder.userId, session.userId), parentFilter));

		// Fetch Files count for the current level
		const noOfFilesResult = await db
			.select({ files: count() })
			.from(table.user_file)
			.where(and(eq(table.user_file.userId, session.userId), fileParentFilter));
		const noOfFilesDestructured = noOfFilesResult[0]?.files ?? 0;

		// Fetch Files for the current level (paginated)
		const files = await db
			.select()
			.from(table.user_file)
			.where(and(eq(table.user_file.userId, session.userId), fileParentFilter))
			.limit(pageSizeInt);

		const fileTypes = await db
			.selectDistinct({ mimetype: table.user_file.mimetype })
			.from(table.user_file)
			.where(eq(table.user_file.userId, session.userId));

		let currentFolder = null;
		if (parentId) {
			const folderResult = await db
				.select({
					id: table.folder.id,
					name: table.folder.name,
					parentId: table.folder.parentFolderId
				})
				.from(table.folder)
				.where(and(eq(table.folder.id, parentId), eq(table.folder.userId, session.userId)));
			currentFolder = folderResult[0] || null;
		}

		return {
			folders,
			files,
			pageSize: pageSizeInt,
			totalFiles: noOfFilesDestructured,
			fileTypes,
			currentParentId: parentId,
			currentFolder: currentFolder
		};
	} catch (err) {
		fail(500, { message: 'Failed to read from database!' });
	}
};

export const actions: Actions = {
	createFolder: async (event) => {
		const currentUser = event.locals.session?.userId;

		if (!currentUser) {
			return fail(401, { message: 'Not authenticated, please login again' });
		}

		const formData = await event.request.formData();
		const folderName = formData.get('folderName');

		const parentId = formData.get('parentId') as string | null;

		if (!folderName || typeof folderName !== 'string' || folderName.trim() === '') {
			return fail(400, { message: 'Folder name cannot be empty' });
		}

		const trimmedFolderName = folderName.trim();
		const sanitizedFolderName = sanitizePathSegment(trimmedFolderName); // Sanitize for path use

		if (!sanitizedFolderName) {
			return fail(400, {
				message: 'Folder name contains invalid characters or is empty after sanitization.'
			});
		}

		let parentUri = '';
		let newFolderUri = sanitizedFolderName;
		const baseUserPath = path.join('/mnt', 'AppStorage', currentUser);
		let newFolderPath = path.join(baseUserPath, newFolderUri);

		try {
			// Fetch parent URI (Path) if creating a subfolder
			console.log('Current parentId', parentId);
			if (parentId) {
				const parentFolderResult = await db
					.select({ uri: table.folder.URI })
					.from(table.folder)
					.where(and(eq(table.folder.id, parentId), eq(table.folder.userId, currentUser)))
					.limit(1);

				if (parentFolderResult.length === 0) {
					return fail(404, { message: 'Parent folder not found.' });
				}
				parentUri = parentFolderResult[0].uri;
				newFolderUri = path.join(parentUri, sanitizedFolderName);
				newFolderPath = path.join(baseUserPath, newFolderUri);
			}

			const existingDbFolder = await db
				.select({ id: table.folder.id })
				.from(table.folder)
				.where(
					and(
						eq(table.folder.userId, currentUser),
						eq(table.folder.name, trimmedFolderName),
						parentId
							? eq(table.folder.parentFolderId, parentId)
							: isNull(table.folder.parentFolderId)
					)
				)
				.limit(1);

			if (existingDbFolder.length > 0) {
				return fail(409, { message: 'A folder with this name already exists in this location.' });
			}

			// Check if filesystem path already exists
			try {
				await fsp.access(newFolderPath);
				return fail(409, {
					message: 'A file or folder already exists at the target location on disk.'
				});
			} catch (accessError: any) {
				// ENOENT means path does NOT exist
				if (accessError.code !== 'ENOENT') {
					console.error('Filesystem access check error:', accessError);
					return fail(500, { message: 'Server error checking folder path.' });
				}
			}

			try {
				await fsp.mkdir(newFolderPath, { recursive: false }); // Create only the final directory
				console.log('Directory created:', newFolderPath);
			} catch (mkdirError) {
				console.error('Failed to create directory:', mkdirError);
				return fail(500, { message: 'Failed to create folder directory on server.' });
			}

			try {
				await db.insert(table.folder).values({
					userId: currentUser,
					name: trimmedFolderName,
					parentFolderId: parentId ? parentId : null,
					URI: newFolderUri
				});

				return { success: true, message: 'Folder created!' };
			} catch (dbError) {
				console.error('Failed to insert folder into DB:', dbError);
				// Attempt to clean up the created directory if DB insert fails
				try {
					await fsp.rmdir(newFolderPath);
					console.log('Cleaned up directory after DB error:', newFolderPath);
				} catch (cleanupError) {
					console.error('Failed to cleanup directory after DB error:', cleanupError);
				}
				return fail(500, { message: 'Failed to save folder record.' });
			}
		} catch (err) {
			console.error('Unexpected error creating folder:', err);
			return fail(500, { message: 'An unexpected server error occurred.' });
		}
	},

	upload: async (event) => {
		const currentUser = event.locals.user?.id;

		if (!currentUser) {
			return fail(401, { message: 'Not authenticated' });
		}

		const formData = await event.request.formData();
		const files = formData.getAll('file') as File[];
		const folderId = formData.get('parentId') as string | null;

		if (!files || files.length === 0) {
			return fail(400, { message: 'No file uploaded' });
		}

		// Used for batch inserting to DB after all files are uploaded to lower DB overhead
		const insertValues = [];
		for (const file of files) {
			if (!(file instanceof File)) {
				return fail(400, { message: 'Invalid file type' });
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
			const baseUserPath = path.join('/mnt', 'AppStorage', currentUser);
			let targetFolderDbUri = '';
			let uploadDir = baseUserPath;
			let fileDbUri = '';

			let filenameType = path.extname(sanitizedFileName);
			let filenameBase = path.basename(sanitizedFileName, filenameType);

			if (folderId) {
				try {
					const parentFolderResult = await db
						.select({ uri: table.folder.URI })
						.from(table.folder)
						.where(and(eq(table.folder.id, folderId), eq(table.folder.userId, currentUser)))
						.limit(1);

					if (parentFolderResult.length === 0) {
						// Folder not found or user doesn't own it
						return fail(404, { message: 'Target folder not found or access denied.' });
					}
					targetFolderDbUri = parentFolderResult[0].uri;
					uploadDir = path.join(baseUserPath, targetFolderDbUri);
					fileDbUri = path.join(currentUser, targetFolderDbUri, sanitizedFileName);
				} catch (dbError) {
					console.error('Error fetching target folder URI:', dbError);
					return fail(500, { message: 'Server error determining upload location.' });
				}
			} else {
				// If no folderId, upload to root directory
				fileDbUri = path.join(currentUser, sanitizedFileName);
			}

			// Check if file name is already in use
			const existingFile = await db
				.select({ count: count() })
				.from(table.user_file)
				.where(
					and(
						eq(table.user_file.userId, currentUser),
						like(
							table.user_file.filename,
							`${path.basename(sanitizedFileName, path.extname(sanitizedFileName))}%`
						),
						folderId ? eq(table.user_file.folderId, folderId) : isNull(table.user_file.folderId)
					)
				);

			if (existingFile[0].count > 0) {
				sanitizedFileName = `${filenameBase}-${existingFile[0].count}${filenameType}`;
			}

			// Ensure the upload directory exists
			try {
				await fs.promises.mkdir(uploadDir, { recursive: true });
			} catch (err) {
				console.error('Failed to create directory:', err);
				return fail(500, { message: 'Failed to create directory' });
			}

			const filePath = path.join(uploadDir, sanitizedFileName);
			const arrayBuffer = await file.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);

			// Write the file to disk
			try {
				// In case name change resulted in duplicate file name
				const fileExists = fs.existsSync(filePath);
				if (fileExists) {
					return fail(400, { message: 'File already exists, please alter file name' });
				}

				await fs.promises.writeFile(filePath, buffer);

				insertValues.push({
					userId: currentUser,
					filename: sanitizedFileName,
					extension: extension,
					mimetype: mimetype,
					uploadedAt: new Date(),
					fileSize: file.size,
					URI: fileDbUri,
					folderId: folderId ? folderId : null
				});
			} catch (err) {
				// If error occured, db insert definitely failed so ensure file is deleted
				await fs.promises.unlink(filePath);
				console.error(err);
				return fail(500, { message: 'Failed to write file' });
			}
		}
		await db.insert(table.user_file).values(insertValues);
		return { success: true, message: 'Files uploaded!' };
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
