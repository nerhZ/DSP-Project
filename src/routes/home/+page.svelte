<script lang="ts">
	import emptyBox from '$lib/images/empty-white-box-svgrepo-com.svg'; // Make sure to replace this with the actual path to your image
	import downloadIcon from '$lib/images/download-svgrepo-com.svg';
	import audioIcon from '$lib/images/audio-library-svgrepo-com.svg';
	import videoIcon from '$lib/images/video-library-svgrepo-com.svg';
	import fileIcon from '$lib/images/file-library-svgrepo-com.svg';
	import Bin from '$lib/images/bin-half-svgrepo-com.svg';
	import { enhance } from '$app/forms';
	import { ToastGenerator } from '$lib/toast.svelte';
	import { goto } from '$app/navigation';
	import mime from 'mime';

	let { data } = $props();

	type File = {
		name: string;
		dataBase64: string;
		dataBlob: Blob;
		dataURL: string;
	};

	let previewModal: HTMLDialogElement;
	let deleteModal: HTMLDialogElement;
	let previewFile: File | null = $state(null);
	let toastGen = ToastGenerator();
	let deleteSubmit: HTMLButtonElement;

	// Convert files to Blob URLs on load
	let files: File[] = data.files
		? data.files.map((file) => {
				const { blob, url } = base64ToBlobAndURL(file.data, file.name);
				return {
					name: file.name,
					dataBase64: file.data,
					dataBlob: blob,
					dataURL: url
				};
			})
		: [];

	function isImage(fileName: string): boolean {
		const imageExtensions = ['.jpg', '.jpeg', '.webp', '.png', '.gif', '.bmp', '.tiff', '.svg'];
		return imageExtensions.includes(fileName.slice(fileName.lastIndexOf('.')).toLowerCase());
	}

	function isVideo(fileName: string): boolean {
		const videoExtensions = [
			'.webm',
			'.mp4',
			'.3gpp',
			'.mov',
			'.avi',
			'.mpeg',
			'.wmv',
			'.flv',
			'.ogg'
		];
		return videoExtensions.includes(fileName.slice(fileName.lastIndexOf('.')).toLowerCase());
	}

	function isPDF(fileName: string): boolean {
		return mime.getType(fileName) === 'application/pdf';
	}

	function isAudio(fileName: string): boolean {
		const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];
		return audioExtensions.includes(fileName.slice(fileName.lastIndexOf('.')).toLowerCase());
	}

	function openPreview(file: File) {
		if (isImage(file.name) || isVideo(file.name) || isAudio(file.name) || isPDF(file.name)) {
			previewFile = file;
			previewModal.showModal();
		}
	}

	function base64ToBlobAndURL(base64: string, fileName: string): { blob: Blob; url: string } {
		// Remove the data URL prefix if present
		const base64Data = base64.split(',')[1] || base64;

		// Convert Base64 to binary
		const byteCharacters = atob(base64Data);
		const byteNumbers = new Array(byteCharacters.length);

		for (let i = 0; i < byteCharacters.length; i++) {
			byteNumbers[i] = byteCharacters.charCodeAt(i);
		}

		const byteArray = new Uint8Array(byteNumbers);

		const mimeType = mime.getType(fileName) || 'application/octet-stream';

		// Create a Blob from the binary data
		const blob = new Blob([byteArray], { type: mimeType });

		return { blob: blob, url: URL.createObjectURL(blob) };
	}
</script>

{#if files.length > 0}
	<div class="container mx-auto w-full md:w-11/12 lg:w-10/12 xl:w-4/5">
		<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
			{#each files as file (file.name)}
				<div class="card bg-base-300 justify-center shadow-xl">
					<button type="button" class="flex-col" onclick={() => openPreview(file)}>
						{#if isImage(file.name)}
							<img
								src={`data:image/*;base64,${file.dataBase64}`}
								alt={file.name}
								class="h-auto w-full cursor-pointer"
							/>
						{:else if isVideo(file.name)}
							<img src={videoIcon} alt="Video Icon" class="h-auto w-full cursor-pointer" />
						{:else if isAudio(file.name)}
							<img src={audioIcon} alt="Audio Icon" class="h-auto w-full cursor-pointer" />
						{:else if mime.getType(file.name) == 'application/pdf'}
							<img src={fileIcon} alt="File Icon" class="h-auto w-full cursor-pointer" />
							<p class="cursor-pointer text-center">PDF preview available</p>
						{:else}
							<img src={fileIcon} alt="File Icon" class="h-auto w-full cursor-pointer" />
							<p class="cursor-pointer text-center">No preview available</p>
						{/if}
					</button>
					<div class="card-body justify-center text-center">
						<h2 class="card-title text-center text-base">{file.name}</h2>
						<div class="card-actions justify-center">
							<a
								href={file.dataURL}
								download={file.name}
								class="mt-2 flex items-center justify-center text-center text-blue-500"
								aria-label="Download"
							>
								<img src={downloadIcon} width="35px" alt="Download Symbol" />
							</a>
							<form
								method="post"
								action="?/delete"
								use:enhance={({ cancel }) => {
									if (!confirm(`Are you sure you want to delete? ${file.name}`)) {
										cancel();
									}
									return async ({ update, result }) => {
										switch (result.type) {
											case 'success':
												toastGen.addToast('Successfully deleted file!', 'alert-success');
												previewModal.close();
												await goto('/');
												break;
											case 'error':
												toastGen.addToast(
													result.error?.message ?? 'An error occurred while deleting the file.',
													'alert-error'
												);
												break;
										}
										await update();
									};
								}}
							>
								<button class="ml-2 text-red-500 hover:text-red-700">
									<img src={Bin} class="mt-2" alt="Delete" width="35px" />
									<input type="hidden" name="file" value={file.name} />
								</button>
							</form>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
{:else}
	<div class="flex h-[calc(100vh-100px)] flex-col">
		<div class="flex flex-grow flex-col items-center justify-center text-center text-gray-500">
			<img src={emptyBox} alt="No images" class="mb-5 max-w-xs opacity-25" />
			<h1 class="text-2xl">No files stored currently...</h1>
		</div>
	</div>
{/if}

<!-- Open the modal using ID.showModal() method -->
<dialog
	bind:this={previewModal}
	class="modal min-w-full"
	onclose={() => (previewFile = null)}
	class:pdf-modal={previewFile && isPDF(previewFile.name)}
>
	<div class="modal-box max-h-full w-full">
		<form method="dialog">
			<button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
			<h3 class="text-lg font-bold">File Preview</h3>
			<div class="flex flex-col items-center">
				{#if previewFile}
					{#if isImage(previewFile.name)}
						<img src={previewFile?.dataURL} alt={previewFile.name} class="h-auto w-full" />
					{:else if isVideo(previewFile.name)}
						<!-- svelte-ignore -->
						<video controls class="h-auto w-full">
							<source
								src={previewFile?.dataURL}
								type={mime.getType(previewFile.name) || 'video/mp4'}
							/>
							<track kind="captions" src="" srclang="en" default />
						</video>
					{:else if isAudio(previewFile.name)}
						<audio controls>
							<source
								src={previewFile?.dataURL}
								type={mime.getType(previewFile.name) || 'audio/mpeg'}
							/>
						</audio>
					{:else if isPDF(previewFile.name)}
						<embed
							src={previewFile?.dataURL}
							type="application/pdf"
							class="w-full"
							style="height: calc(100vh - 125px)"
						/>
					{:else}
						<p>No preview available for this file type.</p>
					{/if}
				{/if}
			</div>
		</form>
		<p class="text-center font-semibold">{previewFile?.name}</p>
		<form
			method="post"
			action="?/delete"
			use:enhance={({ cancel }) => {
				if (!confirm(`Are you sure you want to delete? ${previewFile?.name}`)) {
					cancel();
				}
				return async ({ update, result }) => {
					switch (result.type) {
						case 'success':
							toastGen.addToast('Successfully deleted file!', 'alert-success');
							previewModal.close();
							await goto('/');
							break;
						case 'error':
							toastGen.addToast(
								result.error?.message ?? 'An error occurred while deleting the file.',
								'alert-error'
							);
							break;
					}
					await update();
				};
			}}
		>
			<div class="flex items-center justify-center text-center">
				<a
					href={previewFile?.dataURL}
					download={previewFile?.name}
					class="mt-2 text-blue-500"
					aria-label="Download"
				>
					<img src={downloadIcon} width="35px" alt="Download Symbol" />
				</a>
				<button class="ml-2 text-red-500 hover:text-red-700">
					<img src={Bin} class="mt-2" alt="Delete" width="35px" />
					<input type="hidden" name="file" value={previewFile?.name} />
				</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>

<style>
	.pdf-modal .modal-box {
		width: 100vw;
		max-width: 100vw;
		height: 100vh;
		max-height: 100vh;
	}
</style>
