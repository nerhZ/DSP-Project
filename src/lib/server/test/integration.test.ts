// src/lib/server/test/integration.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import AdmZip from 'adm-zip';

const APP_URL = 'http://localhost:5173';
const TEST_USER_ID = 'integration-test-user-abc';
const STORAGE_ROOT = path.join('/mnt', 'AppStorage');
const TEST_USER_STORAGE_PATH = path.join(STORAGE_ROOT, TEST_USER_ID);

// Helper function to clean up test user data and files before/after tests
async function cleanupTestUserResources() {
	console.log(`Cleaning up resources for user: ${TEST_USER_ID}`);
	try {
		// Cascade delete should handle folders and files due to schema setup
		const deleteResult = await db
			.delete(table.user)
			.where(eq(table.user.id, TEST_USER_ID))
			.returning();
		if (deleteResult.length > 0) {
			console.log(`Deleted user ${TEST_USER_ID} from database.`);
		} else {
			console.log(`User ${TEST_USER_ID} not found in database (already clean?).`);
		}
	} catch (error) {
		console.error(`Error deleting user ${TEST_USER_ID} from database:`, error);
	}

	try {
		await fsp.rm(TEST_USER_STORAGE_PATH, { recursive: true, force: true });
		console.log(`Removed filesystem directory: ${TEST_USER_STORAGE_PATH}`);
	} catch (error: any) {
		if (error.code === 'ENOENT') {
			console.log(`Filesystem directory ${TEST_USER_STORAGE_PATH} not found (already clean?).`);
		} else {
			console.error(`Error removing filesystem directory ${TEST_USER_STORAGE_PATH}:`, error);
		}
	}
}

describe('/home actions and API (Integration Testing)', () => {
	// Ensure a clean slate before all tests
	beforeAll(async () => {
		await cleanupTestUserResources();
	});

	// Clean up and set up a fresh user before each test
	beforeEach(async () => {
		await cleanupTestUserResources();
		try {
			const testUsername = `testuser_${TEST_USER_ID}`;
			await db.insert(table.user).values({
				id: TEST_USER_ID,
				username: testUsername,
				passwordHash: 'test-password-hash-placeholder'
			});
			console.log(`Created test user ${TEST_USER_ID} for the test.`);
		} catch (error) {
			console.error(`Failed to create test user ${TEST_USER_ID}:`, error);
			// Fail fast if user creation fails, as tests depend on it
			throw new Error(`Setup failed: Could not create test user ${TEST_USER_ID}`);
		}
	});

	// Final cleanup after all tests in the suite have run
	afterAll(async () => {
		await cleanupTestUserResources();
	});

	// Test SvelteKit Form Actions under /home?/...

	it('POST /home?/createFolder should create a folder in the database and filesystem', async () => {
		const folderName = 'MyCleanTestFolder';
		const formData = new FormData();
		formData.append('folderName', folderName);
		formData.append('parentId', ''); // Target root folder

		const response = await fetch(`${APP_URL}/home?/createFolder`, {
			method: 'POST',
			body: formData,
			headers: { 'X-Test-User-Id': TEST_USER_ID }
		});

		// Check HTTP response status (allow success or redirect)
		if (!response.ok && response.status !== 303) {
			const errorBody = await response.text();
			console.error('Fetch failed:', response.status, errorBody);
		}
		expect(
			[200, 201, 303].includes(response.status),
			`Unexpected status code: ${response.status}`
		).toBe(true);

		// Verify folder exists in the database
		const results = await db
			.select()
			.from(table.folder)
			.where(
				and(
					eq(table.folder.name, folderName),
					eq(table.folder.userId, TEST_USER_ID),
					isNull(table.folder.parentFolderId)
				)
			)
			.limit(1);
		const createdFolder = results[0];

		expect(
			createdFolder,
			`Folder '${folderName}' not found in DB for user ${TEST_USER_ID}`
		).toBeDefined();
		expect(createdFolder?.name).toBe(folderName);
		expect(createdFolder?.userId).toBe(TEST_USER_ID);

		// Verify folder exists on the filesystem
		const expectedFolderPath = path.join(TEST_USER_STORAGE_PATH, folderName);
		try {
			await fsp.access(expectedFolderPath);
		} catch (error) {
			expect.fail(
				`Filesystem directory ${expectedFolderPath} was not created or is not accessible.`
			);
		}
	});

	it('POST /home?/upload should upload a file to the root directory', async () => {
		const fileName = `test-upload-${Date.now()}.txt`;
		const fileContent = 'This is the content of the test file.';
		const fileBlob = new Blob([fileContent], { type: 'text/plain' });

		const formData = new FormData();
		formData.append('file', fileBlob, fileName);
		formData.append('parentId', ''); // Target root directory

		const response = await fetch(`${APP_URL}/home?/upload`, {
			method: 'POST',
			body: formData,
			headers: {
				'X-Test-User-Id': TEST_USER_ID
			}
		});

		// Check HTTP response status
		if (!response.ok && response.status !== 303) {
			const errorBody = await response.text();
			console.error('Upload fetch failed:', response.status, errorBody);
		}
		expect(
			[200, 201, 303].includes(response.status),
			`Unexpected upload status code: ${response.status}`
		).toBe(true);

		// Verify file record exists in the database
		const results = await db
			.select()
			.from(table.user_file)
			.where(
				and(
					eq(table.user_file.filename, fileName),
					eq(table.user_file.userId, TEST_USER_ID),
					isNull(table.user_file.folderId) // Check it's in the root
				)
			)
			.limit(1);
		const uploadedFileRecord = results[0];

		expect(
			uploadedFileRecord,
			`File record '${fileName}' not found in DB for user ${TEST_USER_ID}`
		).toBeDefined();
		expect(uploadedFileRecord?.filename).toBe(fileName);
		expect(uploadedFileRecord?.userId).toBe(TEST_USER_ID);
		expect(uploadedFileRecord?.mimetype).toBe('text/plain');
		expect(uploadedFileRecord?.fileSize).toBe(fileContent.length);

		// Verify file exists on the filesystem with correct content
		const expectedFilePath = path.join(STORAGE_ROOT, uploadedFileRecord!.URI); // Use URI from DB record
		try {
			const actualContent = await fsp.readFile(expectedFilePath, 'utf-8');
			expect(actualContent).toBe(fileContent);
		} catch (error) {
			console.error(`Error reading uploaded file from filesystem: ${error}`);
			expect.fail(`Uploaded file ${expectedFilePath} was not found or content mismatch.`);
		}
	});

	it('POST /home?/delete should delete a file from the database and filesystem', async () => {
		// Arrange: Create a file record and dummy file to delete
		const fileNameToDelete = `test-delete-${Date.now()}.txt`;
		const fileUri = `${TEST_USER_ID}/${fileNameToDelete}`;
		const fileContentToDelete = 'Delete me!';

		const insertedFile = await db
			.insert(table.user_file)
			.values({
				filename: fileNameToDelete,
				userId: TEST_USER_ID,
				folderId: null, // Root folder
				URI: fileUri,
				mimetype: 'text/plain',
				extension: 'txt',
				fileSize: fileContentToDelete.length,
				uploadedAt: new Date()
			})
			.returning({ id: table.user_file.id });

		const fileIdToDelete = insertedFile[0].id;
		expect(fileIdToDelete).toBeDefined();

		const absoluteFilePath = path.join(STORAGE_ROOT, fileUri);
		await fsp.mkdir(path.dirname(absoluteFilePath), { recursive: true });
		await fsp.writeFile(absoluteFilePath, fileContentToDelete);
		expect(
			async () => await fsp.access(absoluteFilePath),
			'Dummy file for deletion was not created'
		).not.toThrow();

		const formData = new FormData();
		formData.append('file', fileIdToDelete.toString()); // Action expects string form data

		// Act: Call the delete action
		const response = await fetch(`${APP_URL}/home?/delete`, {
			method: 'POST',
			body: formData,
			headers: {
				'X-Test-User-Id': TEST_USER_ID
			}
		});

		// Assert: Check response and state
		if (!response.ok && response.status !== 303) {
			const errorBody = await response.text();
			console.error('Delete fetch failed:', response.status, errorBody);
		}
		expect(
			[200, 204, 303].includes(response.status), // 204 No Content is also common for delete
			`Unexpected delete status code: ${response.status}`
		).toBe(true);

		// Verify file is gone from DB
		const results = await db
			.select()
			.from(table.user_file)
			.where(eq(table.user_file.id, fileIdToDelete))
			.limit(1);
		const deletedFileRecord = results[0];
		expect(
			deletedFileRecord,
			`File record with ID ${fileIdToDelete} was not deleted from DB.`
		).toBeUndefined();

		// Verify file is gone from filesystem
		try {
			await fsp.access(absoluteFilePath);
			expect.fail(`Filesystem file ${absoluteFilePath} was not deleted.`);
		} catch (error: any) {
			// Expecting ENOENT (Error NO ENTry/File not found)
			expect(error.code).toBe('ENOENT');
		}
	});

	// Test API Endpoints under /api/...

	it('POST /api/downloadFile should return file content as base64', async () => {
		// Arrange: Create a file record and physical file to download
		const fileNameToDownload = `test-download-${Date.now()}.dat`;
		const fileUri = `${TEST_USER_ID}/${fileNameToDownload}`;
		const fileContentToDownload = 'This is the download test content!';

		const insertedFile = await db
			.insert(table.user_file)
			.values({
				filename: fileNameToDownload,
				userId: TEST_USER_ID,
				folderId: null, // Root folder
				URI: fileUri,
				mimetype: 'application/octet-stream',
				extension: 'dat',
				fileSize: fileContentToDownload.length,
				uploadedAt: new Date()
			})
			.returning({ id: table.user_file.id });

		const fileIdToDownload = insertedFile[0].id;
		expect(fileIdToDownload).toBeDefined();

		const absoluteFilePath = path.join(STORAGE_ROOT, fileUri);
		await fsp.mkdir(path.dirname(absoluteFilePath), { recursive: true });
		await fsp.writeFile(absoluteFilePath, fileContentToDownload);
		expect(
			async () => await fsp.access(absoluteFilePath),
			'Dummy file for download was not created'
		).not.toThrow();

		// Act: Call the download API
		const response = await fetch(`${APP_URL}/api/downloadFile`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json', // API expects JSON
				'X-Test-User-Id': TEST_USER_ID
			},
			body: JSON.stringify({ file: fileIdToDownload }) // Send file ID in JSON body
		});

		// Assert: Check response and content
		expect(response.ok, `Download API request failed with status ${response.status}`).toBe(true);
		expect(response.status).toBe(200);

		const responseBody = await response.json();

		expect(responseBody).toHaveProperty('body.data.fileContent');
		expect(responseBody.body.data.fileName).toBe(fileNameToDownload);
		expect(responseBody.body.data.fileId).toBe(fileIdToDownload);

		// Decode Base64 content and compare
		const receivedContent = Buffer.from(responseBody.body.data.fileContent, 'base64').toString(
			'utf-8'
		);
		expect(receivedContent).toBe(fileContentToDownload);
	});

	it('POST /api/downloadFiles should download multiple files as a zip archive', async () => {
		// Arrange: Create multiple files for download
		const filesToCreate = [
			{ name: `dfile1-${Date.now()}.txt`, content: 'Download File 1 Content' },
			{ name: `dfile2-${Date.now()}.log`, content: 'Download File 2 Content - Log' },
			{ name: `dfile3-${Date.now()}.md`, content: '# Download File 3 Content - Markdown' }
		];
		const itemsToRequest: { id: number; type: 'file'; name: string }[] = [];

		console.log('Arranging files for multi-download test...');
		for (const fileInfo of filesToCreate) {
			const fileUri = `${TEST_USER_ID}/${fileInfo.name}`; // Files in root for simplicity
			const absoluteFilePath = path.join(STORAGE_ROOT, fileUri);

			const inserted = await db
				.insert(table.user_file)
				.values({
					filename: fileInfo.name,
					userId: TEST_USER_ID,
					folderId: null, // Root
					URI: fileUri,
					mimetype: 'application/octet-stream', // Mimetype isn't critical for zip test
					extension: path.extname(fileInfo.name).substring(1),
					fileSize: fileInfo.content.length,
					uploadedAt: new Date()
				})
				.returning({ id: table.user_file.id });

			const fileId = inserted[0].id;
			itemsToRequest.push({ id: fileId, type: 'file', name: fileInfo.name });
			console.log(`Created DB record for ${fileInfo.name} (ID: ${fileId})`);

			await fsp.mkdir(path.dirname(absoluteFilePath), { recursive: true });
			await fsp.writeFile(absoluteFilePath, fileInfo.content);
			expect(
				async () => await fsp.access(absoluteFilePath),
				`Dummy file ${fileInfo.name} was not created`
			).not.toThrow();
			console.log(`Created physical file: ${absoluteFilePath}`);
		}
		expect(itemsToRequest.length).toBe(filesToCreate.length);

		// Act: Call the multi-download API
		console.log('Sending request to /api/downloadFiles...');
		const response = await fetch(`${APP_URL}/api/downloadFiles`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Test-User-Id': TEST_USER_ID
			},
			body: JSON.stringify({ items: itemsToRequest }) // Send the array of items
		});

		// Assert: Check response and zip content
		expect(response.ok, `DownloadFiles API failed with status ${response.status}`).toBe(true);
		expect(response.status).toBe(200);
		console.log('Received OK response from /api/downloadFiles');

		const responseBody = await response.json();

		expect(responseBody).toHaveProperty('body.data.fileContent');
		expect(responseBody.body.data.fileName).toBe('download.zip');
		console.log('Response structure verified.');

		const base64Content = responseBody.body.data.fileContent;
		const zipBuffer = Buffer.from(base64Content, 'base64');
		console.log(
			`Received zip data (Base64 length: ${base64Content.length}, Buffer size: ${zipBuffer.length} bytes)`
		);

		// Verify Zip Content
		try {
			const zip = new AdmZip(zipBuffer);
			const zipEntries = zip.getEntries();

			expect(
				zipEntries.length,
				`Expected ${filesToCreate.length} files in zip, but found ${zipEntries.length}`
			).toBe(filesToCreate.length);
			console.log(`Found ${zipEntries.length} entries in the zip archive.`);

			for (const fileInfo of filesToCreate) {
				// API uses relative path within zip; root files have just the filename
				const expectedZipPath = fileInfo.name;
				const entry = zip.getEntry(expectedZipPath);

				expect(entry, `File '${expectedZipPath}' not found in the zip archive`).toBeDefined();

				if (entry) {
					console.log(`Verifying content for zip entry: ${entry.entryName}`);
					const entryContent = entry.getData().toString('utf-8');
					expect(entryContent, `Content mismatch for file '${expectedZipPath}' in zip`).toBe(
						fileInfo.content
					);
				}
			}
			console.log('All file contents in zip verified successfully.');
		} catch (zipError) {
			console.error('Error processing zip file:', zipError);
			// Optionally write the buffer to a file for manual inspection on failure
			// await fsp.writeFile('debug_download.zip', zipBuffer);
			expect.fail('Failed to read or verify the downloaded zip archive.');
		}
	});

	it('POST /api/deleteItems should delete multiple specified files', async () => {
		// Arrange: Create multiple files to delete
		const filesToDeleteInfo = [
			{ name: `delMulti1-${Date.now()}.txt`, content: 'Delete Me 1' },
			{ name: `delMulti2-${Date.now()}.log`, content: 'Delete Me 2' },
			{ name: `delMulti3-${Date.now()}.tmp`, content: 'Delete Me 3' }
		];
		const itemsToDeletePayload: { id: number; type: 'file'; name: string }[] = [];
		const filePathsToDelete: string[] = [];
		const fileIdsToDelete: number[] = [];

		console.log('Arranging files for multi-delete test...');
		for (const fileInfo of filesToDeleteInfo) {
			const fileUri = `${TEST_USER_ID}/${fileInfo.name}`;
			const absoluteFilePath = path.join(STORAGE_ROOT, fileUri);
			filePathsToDelete.push(absoluteFilePath);

			const inserted = await db
				.insert(table.user_file)
				.values({
					filename: fileInfo.name,
					userId: TEST_USER_ID,
					folderId: null, // Root
					URI: fileUri,
					mimetype: 'text/plain',
					extension: path.extname(fileInfo.name).substring(1),
					fileSize: fileInfo.content.length,
					uploadedAt: new Date()
				})
				.returning({ id: table.user_file.id });

			const fileId = inserted[0].id;
			fileIdsToDelete.push(fileId);
			itemsToDeletePayload.push({ id: fileId, type: 'file', name: fileInfo.name });
			console.log(`Created DB record for ${fileInfo.name} (ID: ${fileId})`);

			await fsp.mkdir(path.dirname(absoluteFilePath), { recursive: true });
			await fsp.writeFile(absoluteFilePath, fileInfo.content);
			expect(
				async () => await fsp.access(absoluteFilePath),
				`Dummy file ${fileInfo.name} was not created for deletion test`
			).not.toThrow();
			console.log(`Created physical file: ${absoluteFilePath}`);
		}
		expect(itemsToDeletePayload.length).toBe(filesToDeleteInfo.length);

		// Act: Call the multi-delete API
		console.log('Sending request to /api/deleteItems...');
		const response = await fetch(`${APP_URL}/api/deleteItems`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Test-User-Id': TEST_USER_ID
			},
			body: JSON.stringify({ items: itemsToDeletePayload }) // Send the array of items
		});

		// Assert: Check response and state
		expect(response.ok, `DeleteItems API failed with status ${response.status}`).toBe(true);
		expect(response.status).toBe(200); // Expect 200 for full success
		console.log('Received OK response from /api/deleteItems');

		const responseBody = await response.json();
		expect(responseBody.body?.message).toContain(
			`Successfully deleted ${filesToDeleteInfo.length} item(s)`
		);
		console.log('Response message verified.');

		// Verify files are gone from DB
		const remainingDbFiles = await db
			.select({ id: table.user_file.id })
			.from(table.user_file)
			.where(
				and(
					eq(table.user_file.userId, TEST_USER_ID),
					inArray(table.user_file.id, fileIdsToDelete) // Check if any target IDs still exist
				)
			);
		expect(
			remainingDbFiles.length,
			`Expected 0 files in DB with IDs [${fileIdsToDelete.join(', ')}], but found ${remainingDbFiles.length}`
		).toBe(0);
		console.log('DB records verified as deleted.');

		// Verify files are gone from filesystem
		for (const filePath of filePathsToDelete) {
			try {
				await fsp.access(filePath);
				// If access doesn't throw, the file still exists (failure)
				expect.fail(`Filesystem file ${filePath} was not deleted.`);
			} catch (error: any) {
				// Expecting ENOENT (Error NO ENTry/File not found)
				expect(error.code, `Expected ENOENT for ${filePath}, but got ${error.code}`).toBe('ENOENT');
			}
		}
		console.log('Filesystem files verified as deleted.');
	});

	it('POST /api/loadItems should return files and folders for the root directory', async () => {
		// Arrange: Create some folders and files in the root
		const foldersToCreate = [
			{ name: 'FolderA', uri: `${TEST_USER_ID}/FolderA` }, // For sorting check
			{ name: 'FolderZ', uri: `${TEST_USER_ID}/FolderZ` }
		];
		const filesToCreate = [
			{
				name: `FileB-${Date.now()}.log`,
				content: 'Log File',
				uriSuffix: `FileB-${Date.now()}.log`
			},
			{
				name: `FileA-${Date.now()}.txt`,
				content: 'Text File',
				uriSuffix: `FileA-${Date.now()}.txt`
			},
			{
				name: `FileZ-${Date.now()}.dat`,
				content: 'Data File',
				uriSuffix: `FileZ-${Date.now()}.dat`
			}
		];

		console.log('Arranging items for loadItems test...');

		// Create Folders in DB (no physical folders needed for load test)
		for (const folderInfo of foldersToCreate) {
			await db.insert(table.folder).values({
				name: folderInfo.name,
				userId: TEST_USER_ID,
				parentFolderId: null, // Root
				URI: folderInfo.uri,
				createdAt: new Date() // Add createdAt if your schema requires it
			});
			console.log(`Created DB record for folder: ${folderInfo.name}`);
		}

		// Create Files in DB (no physical files needed for load test)
		for (const fileInfo of filesToCreate) {
			const fileUri = `${TEST_USER_ID}/${fileInfo.uriSuffix}`;
			await db.insert(table.user_file).values({
				filename: fileInfo.name,
				userId: TEST_USER_ID,
				folderId: null, // Root
				URI: fileUri,
				mimetype: 'text/plain', // Example mimetype
				extension: path.extname(fileInfo.name).substring(1),
				fileSize: fileInfo.content.length,
				uploadedAt: new Date()
			});
			console.log(`Created DB record for file: ${fileInfo.name}`);
		}

		// Act: Call the load items API for the root directory
		console.log('Sending request to /api/loadItems for root directory...');
		const response = await fetch(`${APP_URL}/api/loadItems`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Test-User-Id': TEST_USER_ID
				// Note: pageSize is read from cookies by the API, defaults to 15
			},
			body: JSON.stringify({
				pageNum: 1, // Request the first page
				parentId: null // Explicitly request root directory items
				// No search, fileType, or date filters for this basic test
			})
		});

		// Assert: Check response structure, counts, and order
		expect(response.ok, `LoadItems API failed with status ${response.status}`).toBe(true);
		expect(response.status).toBe(200);
		console.log('Received OK response from /api/loadItems');

		const responseBody = await response.json();

		expect(responseBody).toHaveProperty('body.folders');
		expect(responseBody.body).toHaveProperty('files');
		expect(responseBody.body).toHaveProperty('totalItems');

		const expectedTotalItems = foldersToCreate.length + filesToCreate.length;
		expect(
			responseBody.body.totalItems,
			`Expected totalItems to be ${expectedTotalItems}, but got ${responseBody.body.totalItems}`
		).toBe(expectedTotalItems);
		console.log(`Total items count (${responseBody.body.totalItems}) verified.`);

		// Verify Folders (Count and Order)
		const receivedFolders = responseBody.body.folders;
		expect(
			receivedFolders.length,
			`Expected ${foldersToCreate.length} folders, but received ${receivedFolders.length}`
		).toBe(foldersToCreate.length);

		const receivedFolderNames = receivedFolders.map((f: any) => f.name);
		const expectedFolderNames = foldersToCreate.map((f) => f.name).sort(); // Sort expected names alphabetically
		expect(receivedFolderNames).toEqual(expectedFolderNames);
		console.log('Folder count and order verified.');

		// Verify Files (Count and Order)
		const receivedFiles = responseBody.body.files;
		expect(
			receivedFiles.length,
			`Expected ${filesToCreate.length} files, but received ${receivedFiles.length}`
		).toBe(filesToCreate.length);

		const receivedFileNames = receivedFiles.map((f: any) => f.filename);
		const expectedFileNames = filesToCreate.map((f) => f.name).sort(); // Sort expected names alphabetically
		expect(receivedFileNames).toEqual(expectedFileNames);
		console.log('File count and order verified.');
	});
}); // End of describe block
