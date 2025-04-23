<script lang="ts">
	import emptyBox from '$lib/images/empty-white-box-svgrepo-com.svg';
	import downloadIcon from '$lib/images/download-svgrepo-com.svg';
	import Bin from '$lib/images/bin-half-svgrepo-com.svg';
	import folderIcon from '$lib/images/Folder.svg';
	import fileIcon from '$lib/images/File.svg';
	import { ToastGenerator } from '$lib/toast.svelte';
	import { invalidateAll } from '$app/navigation';
	import mime from 'mime';
	import { base64ToBlobAndURL } from '$lib/utils';
	import PreviewModal from '$lib/components/PreviewModal.svelte';
	import CreateFolderModal from '$lib/components/CreateFolderModal.svelte';
	import { capitalise } from '$lib/utils';
	import { scale } from 'svelte/transition';
	import { sidebarState, parentFolder } from '$lib/storage.svelte';
	import { debounce } from '$lib/utils.js';
	import type { previewFileType, CheckedItem } from '$lib/types';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();

	let toastGen = ToastGenerator();
	let previewFile: previewFileType | null = $state(null);
	let checkedItems: CheckedItem[] = $state([]);
	let showFloatingButtons = $derived(checkedItems.length > 0);
	let lastCheckedIndex: number | null = $state(null);
	let files = $state(data.files);
	let folders = $state(data.folders);
	let combinedListForIndexing = $derived.by(() => {
		const folderItems = (folders ?? []).map((f, i) => ({
			id: f.id,
			name: f.name,
			type: 'folder' as const,
			index: i
		}));
		const fileItems = (files ?? []).map((f, i) => ({
			id: f.id,
			name: f.filename,
			type: 'file' as const,
			index: (folders?.length ?? 0) + i
		}));
		return [...folderItems, ...fileItems];
	});
	let currentPage: number = $state(1);
	let totalItems: number | undefined = $state(data.totalItems);
	let pageSize: number | undefined = $state(data.pageSize);
	let noOfPages: number | undefined = $derived.by(() => {
		if (totalItems && pageSize) {
			return Math.ceil(totalItems / pageSize);
		}
	});
	let searchQuery: string | null = $state(null);
	const debouncedFetchData = debounce(fetchData, 500);

	let pageSizeSelect: HTMLSelectElement | undefined = $state();
	let sidebarElement: HTMLInputElement | undefined = $state();
	let previewModal: HTMLDialogElement | undefined = $state();
	let createFolderModal: HTMLDialogElement | undefined = $state();
	let typeSelect: string | null = $state(null);
	let startDate: string | null = $state(null);
	let endDate: string | null = $state(null);
	let currentParentId = $derived(page.url.searchParams.get('folderId') ?? null);

	$effect(() => {
		parentFolder.id = page.url.searchParams.get('folderId') ?? null;
	});

	$effect.pre(() => {
		if (pageSizeSelect && data.pageSize) {
			pageSizeSelect.value = data.pageSize.toString();
		}
		// Ensuring that they are reset when the page is loaded, not allowing browser to remember the values
		startDate = null;
		endDate = null;
		typeSelect = null;
		searchQuery = null;
	});

	$effect(() => {
		// Ensure copies are up to date if the load function is called again
		files = data.files;
		folders = data.folders;
		totalItems = data.totalItems;
		pageSize = data.pageSize;
		// Reset to page 1 if the parent folder changes
		currentPage = 1;
		checkedItems = []; // Clear selections on data reload
	});

	$effect(() => {
		if (!sidebarElement) return;

		if (sidebarState.open) {
			sidebarElement.checked = true;
		} else {
			sidebarElement.checked = false;
		}
	});

	async function navigateUp() {
		const parentFolderId = data.currentFolder?.parentId; // Get parentId from loaded data
		if (parentFolderId) {
			await goto(`?folderId=${parentFolderId}`);
			toastGen.addToast('Successfully returned to previous folder.', 'alert-success');
		} else {
			toastGen.addToast('Successfully returned to base folder.', 'alert-success');
			await goto('/home');
		}
	}

	async function navigateRoot() {
		toastGen.addToast('Successfully returned to base folder.', 'alert-success');
		await goto('/home');
	}

	async function fetchData(page: number = 1) {
		try {
			currentPage = page;
			const response = await fetch('/api/loadItems', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					pageNum: currentPage,
					searchQuery: searchQuery,
					pageSize: pageSize,
					fileType: typeSelect,
					startDate,
					endDate,
					parentId: currentParentId
				})
			});
			const result = await response.json();

			if (response.ok) {
				files = result.body.files;
				folders = result.body.folders;
				totalItems = result.body.totalItems;
				if (!totalItems) {
					toastGen.addToast('No files found...', 'alert-error');
					return;
				}
				// Reset checked files & hide floating buttons
				checkedItems = [];
			} else {
				toastGen.addToast(result.body.message || 'Failed to load items.', 'alert-error');
			}
		} catch (error) {
			console.error('Error fetching page:', error);
			toastGen.addToast('Failed to fetch page. Please try again.', 'alert-error');
		}
	}

	async function submitFileForm(fileID: number) {
		try {
			const response = await fetch('/api/downloadFile', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ file: fileID })
			});

			const result = await response.json();

			if (response.ok) {
				const data = result.body.data;
				const { blob, url } = base64ToBlobAndURL(data.fileContent, data.fileName);
				const file = {
					name: data.fileName,
					dataBase64: data.fileContent,
					dataBlob: blob,
					dataURL: url
				};
				openPreview(file);
			} else {
				toastGen.addToast(result.body.message, 'alert-error');
			}
		} catch (error) {
			console.error('Error loading file:', error);
			toastGen.addToast('Failed to load file. Please try again.', 'alert-error');
		}
	}

	async function submitGroupDownload(items: CheckedItem[]) {
		try {
			const response = await fetch('/api/downloadFiles', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ items })
			});

			const result = await response.json();

			if (response.ok) {
				const data = result.body.data;

				const downloadFile = (fileContent: string, fileName: string) => {
					const { blob, url } = base64ToBlobAndURL(fileContent, fileName);
					const link = document.createElement('a');
					link.href = url;
					link.download = fileName;
					document.body.appendChild(link);
					link.click();
					document.body.removeChild(link);
					URL.revokeObjectURL(url); // Free up memory
				};

				downloadFile(data.fileContent, data.fileName);
			} else {
				toastGen.addToast(result.body.message, 'alert-error');
			}
		} catch (error) {
			console.error('Error loading file: ', error);
			toastGen.addToast('Failed to download files. Please try again.', 'alert-error');
		}
	}

	async function submitGroupDeletion(items: CheckedItem[]) {
		if (!confirm(`Are you sure you want to delete all selected files? (CANNOT BE UNDONE!)`)) {
			return;
		}
		try {
			const response = await fetch('/api/deleteItems', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ items: checkedItems })
			});

			const result = await response.json();

			if (response.ok) {
				toastGen.addToast(result.body.message, 'alert-success');
				checkedItems = [];
				invalidateAll();
			} else {
				toastGen.addToast(result.body.message, 'alert-error');
			}
		} catch (error) {
			console.error('Error deleting files: ', error);
			toastGen.addToast('Failed to delete files. Please try again.', 'alert-error');
		}
	}

	function openPreview(file: previewFileType) {
		// Reset it before loading the new file
		previewFile = null;
		let mimedFileType = mime.getType(file.name);
		if (!mimedFileType) {
			toastGen.addToast('File type not supported.', 'alert-error');
			return;
		}
		if (
			mimedFileType.startsWith('image/') ||
			mimedFileType.startsWith('video/') ||
			mimedFileType.startsWith('audio/') ||
			mimedFileType == 'application/pdf'
		) {
			previewFile = file;
			previewModal?.showModal();
		}
	}

	function toggleCheckbox(
		item: { id: number | string; name: string; type: 'file' | 'folder' },
		index: number, // The index in the combined list
		event: MouseEvent,
		isChecked: boolean
	) {
		const shiftKey = event.shiftKey;
		const ctrlKey = event.ctrlKey || event.metaKey; // metaKey for Mac Command key

		const currentItem: CheckedItem = { id: item.id, name: item.name, type: item.type };

		if (shiftKey && lastCheckedIndex !== null && lastCheckedIndex !== index) {
			const startIndex = Math.min(index, lastCheckedIndex);
			const endIndex = Math.max(index, lastCheckedIndex);

			// Select all items in the range from the combined list
			const rangeItems = combinedListForIndexing
				.slice(startIndex, endIndex + 1)
				.map((listItem) => ({ id: listItem.id, name: listItem.name, type: listItem.type }));

			// If Ctrl is also held, add the range to the existing selection (avoiding duplicates)
			if (ctrlKey) {
				const existingIds = new Set(checkedItems.map((ci) => `${ci.type}-${ci.id}`));
				const itemsToAdd = rangeItems.filter((ri) => !existingIds.has(`${ri.type}-${ri.id}`));
				checkedItems = [...checkedItems, ...itemsToAdd];
			} else {
				// Otherwise, set the selection to the range
				checkedItems = rangeItems;
			}
		} else if (ctrlKey) {
			const existingIndex = checkedItems.findIndex(
				(ci) => ci.id === currentItem.id && ci.type === currentItem.type
			);
			if (existingIndex > -1) {
				// Remove if already checked
				checkedItems = checkedItems.filter((_, i) => i !== existingIndex);
			} else {
				// Add if not checked
				checkedItems.push(currentItem);
				// Ensure reactivity when pushing
				checkedItems = checkedItems;
			}
		} else {
			// Single click (no modifiers)
			if (isChecked) {
				checkedItems = [currentItem];
			} else {
				// If clicking the only selected item to uncheck it
				if (
					checkedItems.length === 1 &&
					checkedItems[0].id === currentItem.id &&
					checkedItems[0].type === currentItem.type
				) {
					checkedItems = [];
				} else {
					// This case might occur if clicking an unchecked box when others are checked (without Ctrl/Shift)
					// Standard behavior is to select only the clicked one.
					checkedItems = [currentItem];
				}
			}
		}

		// Update last checked index *only* if not using Ctrl+Shift
		// (to allow extending selection from the original anchor point)
		if (!(ctrlKey && shiftKey)) {
			lastCheckedIndex = index;
		}

		// Stop propagation to prevent row click (preview/navigate)
		event.stopPropagation();
	}

	async function setPageLengthCookie() {
		try {
			if (!pageSizeSelect) {
				toastGen.addToast('Failed to set page size. Please try again.', 'alert-error');
				return;
			}

			pageSize = parseInt(pageSizeSelect.value);
			const response = await fetch('/api/setPageSize', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ pageSize })
			});
			const result = await response.json();

			if (response.ok) {
				toastGen.addToast(result.body.message, 'alert-success');
				fetchData(1);
			} else {
				toastGen.addToast(result.body.message, 'alert-error');
			}
		} catch (error) {
			console.error('Error fetching page:', error);
			toastGen.addToast('Failed to set page size. Please try again.', 'alert-error');
		}
	}
</script>

<div class="drawer lg:drawer-open">
	<input
		id="sidebar"
		type="checkbox"
		class="drawer-toggle"
		bind:this={sidebarElement}
		onchange={() => {
			sidebarState.open = !sidebarState.open;
		}}
	/>
	<div class="drawer-content flex max-w-full flex-col">
		<!-- Page content here -->
		{#if ((files ?? []).length > 0 || (folders ?? []).length > 0) && data.pageSize}
			<div class="flex w-full justify-center">
				<div class="w-full overflow-x-auto">
					<table class="table w-full">
						<thead>
							<tr>
								<th></th>
								<th></th>
								<th class="w-14 min-w-14"></th>
								<th>Name</th>
								<th>Type</th>
								<th>Uploaded Date</th>
								<th>File Size</th>
							</tr>
						</thead>
						<tbody>
							{#each folders ?? [] as folder, i (folder.name)}
								<tr
									class="hover:bg-base-200 cursor-pointer select-none"
									onclick={() => {
										goto(`?folderId=${folder.id}`);
										checkedItems = [];
									}}
								>
									<td>{data.pageSize * (currentPage - 1) + i + 1}</td>
									<td>
										<label>
											<input
												type="checkbox"
												class="checkbox"
												checked={checkedItems.some(
													(ci) => ci.id === folder.id && ci.type === 'folder'
												)}
												onclick={(event) =>
													toggleCheckbox(
														{ id: folder.id, name: folder.name, type: 'folder' },
														i, // Index within the combined list
														event,
														(event.target as HTMLInputElement).checked
													)}
											/>
										</label></td
									>
									<td class="w-6 text-center align-middle">
										<!-- Added w-6 for consistent column width -->
										<img
											src={folderIcon}
											alt="Folder"
											class="inline-block h-5 w-5 align-middle opacity-70"
										/>
									</td>
									<td>{folder.name}</td>
									<td>Folder</td>
									<td>{new Date(folder.createdAt).toLocaleDateString()}</td>
									<td></td>
								</tr>
							{/each}
							{#each files ?? [] as file, i (file.filename)}
								<tr
									class="hover:bg-base-200 cursor-pointer select-none"
									onclick={() => submitFileForm(file.id)}
								>
									<td>{(pageSize ?? 0) * (currentPage - 1) + (folders?.length ?? 0) + i + 1}</td>
									<td>
										<label>
											<input
												type="checkbox"
												class="checkbox"
												checked={checkedItems.some((ci) => ci.id === file.id && ci.type === 'file')}
												onclick={(event) =>
													toggleCheckbox(
														{ id: file.id, name: file.filename, type: 'file' },
														(folders?.length ?? 0) + i, // Index within the combined list
														event,
														(event.target as HTMLInputElement).checked
													)}
											/>
										</label></td
									>
									<!-- Icon -->
									<td class="w-6 text-center align-middle">
										<!-- Added w-6 for consistent column width -->
										<img
											src={fileIcon}
											alt="File"
											class="inline-block h-5 w-5 align-middle opacity-70"
											width="100px"
										/>
									</td>
									<td>{file.filename}</td>
									<td>{capitalise(mime.getType(file.filename)?.split('/')[0] ?? 'unknown')}</td>
									<td>{new Date(file.uploadedAt).toLocaleDateString()}</td>
									<td>
										{#if file.fileSize >= 1073741824}
											{(file.fileSize / 1073741824).toFixed(2)} GB
										{:else if file.fileSize >= 1048576}
											{(file.fileSize / 1048576).toFixed(2)} MB
										{:else}
											{(file.fileSize / 1024).toFixed(2)} KB
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
			<div class="join fixed bottom-5 left-5 right-5 z-40 justify-center">
				{#if noOfPages && noOfPages <= 3}
					{#each Array(noOfPages ?? 1) as _, i}
						<button
							class="join-item btn btn-primary btn-lg"
							onclick={() => {
								fetchData(i + 1);
							}}>{i + 1}</button
						>
					{/each}
				{:else}
					<button
						class="join-item btn btn-lg btn-primary"
						onclick={() => {
							if (currentPage === 1) {
								toastGen.addToast('You are already on the first page.', 'alert-error');
								return;
							}
							fetchData(currentPage - 1);
						}}>«</button
					>
					<select class="join-item btn btn-lg btn-primary select-button">
						{#each Array(noOfPages ?? 1) as _, i}
							<option
								onclick={() => {
									if (currentPage === noOfPages) {
										toastGen.addToast('You are already on the last page.', 'alert-error');
										return;
									}
									fetchData(i + 1);
								}}>{i + 1}</option
							>
						{/each}
					</select>
					<button
						class="join-item btn btn-primary btn-lg"
						onclick={() => {
							fetchData(currentPage + 1);
						}}>»</button
					>
				{/if}
			</div>
		{:else}
			<div class="flex h-[calc(100vh-100px)] flex-col">
				<div class="flex flex-grow flex-col items-center justify-center text-center text-gray-500">
					<img src={emptyBox} alt="No images" class="mb-5 max-w-xs opacity-25" />
					<h1 class="text-2xl">No files stored currently...</h1>
				</div>
			</div>
		{/if}
	</div>
	<div class="drawer-side">
		<label for="sidebar" aria-label="close sidebar" class="drawer-overlay"></label>
		<ul
			class="menu bg-base-200 text-base-content lg:bg-base-100 min-h-full w-80 border-r-2 border-r-emerald-950 p-4"
		>
			<!-- Sidebar content here -->
			<li>
				<fieldset class="fieldset no-hover cursor-default">
					<legend class="fieldset-legend">Set a Page Length</legend>
					<select
						class="select cursor-pointer"
						onchange={setPageLengthCookie}
						bind:this={pageSizeSelect}
					>
						<option>10</option>
						<option>15</option>
						<option>20</option>
						<option>50</option>
						<option>100</option>
					</select>
				</fieldset>
			</li>
			<li>
				<fieldset class="fieldset no-hover cursor-default">
					<legend class="fieldset-legend">Search</legend>
					<label class="input">
						<input
							type="text"
							placeholder="Type to Search"
							required
							bind:value={searchQuery}
							oninput={() => {
								debouncedFetchData(currentPage);
							}}
						/>
					</label>
				</fieldset>
			</li>
			<li>
				<fieldset class="fieldset no-hover cursor-default">
					<legend class="fieldset-legend">Filter by Type</legend>
					<select
						class="select cursor-pointer"
						bind:value={typeSelect}
						onchange={() => fetchData()}
					>
						{#if data.fileTypes}
							<option value={null}>Any</option>
							{#if data.folders}
								<option value="Folder">Folder</option>
							{/if}
							{#each data.fileTypes as type}
								<option value={type.mimetype}
									>{type.mimetype.charAt(0).toUpperCase() + type.mimetype.slice(1)}</option
								>
							{/each}
						{/if}
					</select>
				</fieldset>
			</li>
			<li>
				<fieldset class="fieldset no-hover cursor-default">
					<legend class="fieldset-legend">Filter by Date Range (start - end)</legend>
					<div class="join">
						<label class="input join-item">
							<input
								type="date"
								bind:value={startDate}
								onchange={() => {
									if (startDate && endDate && new Date(startDate) > new Date(endDate))
										endDate = null;
									fetchData();
								}}
							/>
						</label>
						<label class="input join-item">
							<input
								type="date"
								bind:value={endDate}
								min={startDate}
								onchange={() => fetchData()}
							/>
						</label>
					</div>
				</fieldset>
			</li>
			<li class="mt-4">
				<button
					class="btn btn-primary"
					onclick={() => {
						createFolderModal?.showModal();
					}}>Create New Folder</button
				>
			</li>
		</ul>
	</div>
</div>

{#if currentParentId}
	<div class="fixed bottom-5 left-5 z-50 row-auto grid">
		{#if data.currentFolder?.parentId}
			<button class="btn btn-outline btn-primary mb-2" in:scale out:scale onclick={navigateUp}>
				Go Up a Folder Level
			</button>
		{/if}
		<button class="btn btn-outline btn-primary" in:scale out:scale onclick={navigateRoot}>
			Return to Base Folder</button
		>
	</div>
{/if}

{#if showFloatingButtons}
	<div class="fixed bottom-5 right-5 z-50" in:scale out:scale>
		<button type="button" aria-label="Delete" onclick={() => submitGroupDownload(checkedItems)}
			><img src={downloadIcon} class="cursor-pointer" width="100px" alt="Download icon" />
		</button>
		<button type="button" aria-label="Delete" onclick={() => submitGroupDeletion(checkedItems)}
			><img src={Bin} class="cursor-pointer" width="100px" alt="Bin icon" />
		</button>
	</div>
{/if}

<PreviewModal {previewFile} bind:previewModalRef={previewModal} />

<CreateFolderModal bind:createFolderModalRef={createFolderModal} parentId={currentParentId} />

<style>
	select option:disabled {
		display: none;
	}

	.fieldset.no-hover {
		border: none;
		padding: 0;
		margin: 0;
	}
	.fieldset.no-hover:hover,
	.fieldset.no-hover:focus {
		background-color: transparent;
		outline: none;
		box-shadow: none;
	}
	.select-button {
		appearance: none;
	}

	select option:disabled {
		display: none;
	}
</style>
