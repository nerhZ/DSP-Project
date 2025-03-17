<script lang="ts">
	import emptyBox from '$lib/images/empty-white-box-svgrepo-com.svg';
	import downloadIcon from '$lib/images/download-svgrepo-com.svg';
	import Bin from '$lib/images/bin-half-svgrepo-com.svg';
	import { ToastGenerator } from '$lib/toast.svelte';
	import { invalidateAll } from '$app/navigation';
	import mime from 'mime';
	import { base64ToBlobAndURL } from '$lib/utils';
	import PreviewModal from '$lib/components/PreviewModal.svelte';
	import { capitalise } from '$lib/utils';
	import { scale } from 'svelte/transition';

	let { data } = $props();

	type PreviewFile = {
		name: string;
		dataBase64: string;
		dataBlob: Blob;
		dataURL: string;
	};

	let previewFile: PreviewFile | null = $state(null);
	let previewModal: HTMLDialogElement | undefined = $state();
	let toastGen = ToastGenerator();
	let checkedFiles: string[] = $state([]);
	let showFloatingButtons = $derived(checkedFiles.length > 0);
	let lastCheckedID: number | null = $state(null);
	let currentPage: number = $state(1);
	let files = $state(data.files);

	$effect(() => {
		console.log($state.snapshot(checkedFiles));
	});

	$effect(() => {
		// If props change (invalidated), update the files
		files = data.files;
	});

	async function submitFileForm(filename: string) {
		try {
			const response = await fetch('/api/downloadFile', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ file: filename })
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

	async function submitGroupDownload(files: string[]) {
		try {
			const response = await fetch('/api/downloadFiles', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ files })
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

	async function submitGroupDeletion(files: string[]) {
		if (!confirm(`Are you sure you want to delete all selected files? (CANNOT BE UNDONE!)`)) {
			return;
		}
		try {
			const response = await fetch('/api/deleteFiles', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ files })
			});

			const result = await response.json();

			if (response.ok) {
				toastGen.addToast(result.body.message, 'alert-success');
				checkedFiles = [];
				invalidateAll();
			} else {
				toastGen.addToast(result.body.message, 'alert-error');
			}
		} catch (error) {
			console.error('Error deleting files: ', error);
			toastGen.addToast('Failed to delete files. Please try again.', 'alert-error');
		}
	}

	function openPreview(file: PreviewFile) {
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
		filename: string,
		fileId: number,
		index: number,
		event: MouseEvent,
		isChecked: boolean
	) {
		const shiftKey = event.shiftKey;
		const ctrlKey = event.ctrlKey || event.metaKey;

		if (!files) {
			toastGen.addToast('Failed to toggle checkbox. Please try again.', 'alert-error');
			return;
		}

		if (shiftKey && lastCheckedID !== null) {
			const startIndex = Math.min(
				index,
				files.findIndex((file) => file.id == lastCheckedID)
			);
			const endIndex = Math.max(
				index,
				files.findIndex((file) => file.id == lastCheckedID)
			);

			const selectedFiles = files.slice(startIndex, endIndex + 1).map((f) => f.filename);

			checkedFiles = checkedFiles.filter((f) => !selectedFiles.includes(f));

			selectedFiles.forEach((f) => {
				if (!checkedFiles.includes(f)) checkedFiles.push(f);
			});
		} else if (ctrlKey) {
			if (checkedFiles.includes(filename)) {
				checkedFiles = checkedFiles.filter((f) => f !== filename);
			} else {
				checkedFiles.push(filename);
			}
		} else {
			// Single click
			if (isChecked) {
				checkedFiles = [filename];
			} else {
				checkedFiles = [];
			}
		}

		lastCheckedID = fileId;

		// Stop preview modal when clicking checkbox
		event.stopPropagation();
	}

	async function fetchPage(page: number) {
		try {
			if (data.noOfPages && (page < 1 || page > data.noOfPages)) {
				toastGen.addToast('Invalid page number.', 'alert-error');
				return;
			}

			const response = await fetch('/api/loadFiles', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ pageNum: page })
			});
			const result = await response.json();

			if (response.ok) {
				files = result.body.files;
				currentPage = page;
				// Reset checked files & hide floating buttons
				checkedFiles = [];
			} else {
				toastGen.addToast(result.body.message, 'alert-error');
			}
		} catch (error) {
			console.error('Error fetching page:', error);
			toastGen.addToast('Failed to fetch page. Please try again.', 'alert-error');
		}
	}
</script>

{#if (files ?? []).length > 0 && data.pageSize}
	<div class="flex w-full justify-center">
		<div class="w-full overflow-x-auto">
			<table class="table w-full">
				<thead>
					<tr>
						<th></th>
						<th></th>
						<th>File Name</th>
						<th>Type</th>
						<th>Uploaded Date</th>
						<th>File Size</th>
					</tr>
				</thead>
				<tbody>
					{#each files ?? [] as file, i (file.filename)}
						<tr
							class="hover:bg-base-200 cursor-pointer select-none"
							onclick={() => submitFileForm(file.filename)}
						>
							<th>{data.pageSize * (currentPage - 1) + i + 1}</th>
							<th>
								<label>
									<input
										type="checkbox"
										class="checkbox"
										checked={checkedFiles.includes(file.filename)}
										onclick={(event) =>
											toggleCheckbox(
												file.filename,
												file.id,
												i,
												event,
												(event.target as HTMLInputElement).checked
											)}
									/>
								</label></th
							>
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
	<div class="join justify-center">
		{#if data && data.noOfPages && data.noOfPages <= 3}
			{#each Array(data.noOfPages ?? 1) as _, i}
				<button
					class="join-item btn btn-lg"
					onclick={() => {
						fetchPage(i + 1);
					}}>{i + 1}</button
				>
			{/each}
		{:else}
			<button
				class="join-item btn btn-lg"
				onclick={() => {
					fetchPage(currentPage - 1);
				}}>«</button
			>
			<select class="join-item btn btn-lg select-button">
				{#each Array(data.noOfPages ?? 1) as _, i}
					<option
						onclick={() => {
							fetchPage(i + 1);
						}}>{i + 1}</option
					>
				{/each}
			</select>
			<button
				class="join-item btn btn-lg"
				onclick={() => {
					fetchPage(currentPage + 1);
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

{#if showFloatingButtons}
	<div class="fixed bottom-5 right-5 z-50" in:scale out:scale>
		<button type="button" aria-label="Delete" onclick={() => submitGroupDownload(checkedFiles)}
			><img src={downloadIcon} class="cursor-pointer" width="100px" alt="Download icon" />
		</button>
		<button type="button" aria-label="Delete" onclick={() => submitGroupDeletion(checkedFiles)}
			><img src={Bin} class="cursor-pointer" width="100px" alt="Bin icon" />
		</button>
	</div>
{/if}

<PreviewModal {previewFile} bind:previewModalRef={previewModal} />

<style>
	.select-button {
		appearance: none;
	}

	select option:disabled {
		display: none;
	}
</style>
