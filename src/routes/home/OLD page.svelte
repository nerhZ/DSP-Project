<script lang="ts">
	// TODO: Move util functions to a util file in lib!
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
	import { base64ToBlobAndURL } from '$lib/utils';
	import PreviewModal from '$lib/components/PreviewModal.svelte';

	let { data } = $props();

	type File = {
		name: string;
		dataBase64: string;
		dataBlob: Blob;
		dataURL: string;
	};

	let deleteModal: HTMLDialogElement;
	let previewFile: File | null = $state(null);
	let previewModal: HTMLDialogElement | undefined = $state();
	let toastGen = ToastGenerator();
	let deleteSubmit: HTMLButtonElement;

	// Convert files to Blob URLs on load
	let files: File[] = $derived.by(() =>
		data.files
			? data.files.map((file) => {
					const { blob, url } = base64ToBlobAndURL(file.data, file.name);
					return {
						name: file.name,
						dataBase64: file.data,
						dataBlob: blob,
						dataURL: url
					};
				})
			: []
	);

	function openPreview(file: File) {
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
</script>

{#if files.length > 0}
	<div class="container mx-auto w-full md:w-11/12 lg:w-10/12 xl:w-4/5">
		<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
			{#each files as file (file.name)}
				<div class="card bg-base-300 justify-center shadow-xl">
					<button type="button" class="flex-col" onclick={() => openPreview(file)}>
						{#if mime.getType(file.name)?.startsWith('image/')}
							<img
								src={`data:image/*;base64,${file.dataBase64}`}
								alt={file.name}
								class="h-auto w-full cursor-pointer"
							/>
						{:else if mime.getType(file.name)?.startsWith('video/')}
							<img src={videoIcon} alt="Video Icon" class="h-auto w-full cursor-pointer" />
						{:else if mime.getType(file.name)?.startsWith('audio/')}
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
								action="/home?/delete"
								use:enhance={({ cancel }) => {
									if (!confirm(`Are you sure you want to delete? ${file.name}`)) {
										cancel();
									}
									return async ({ update, result }) => {
										switch (result.type) {
											case 'success':
												toastGen.addToast('Successfully deleted file!', 'alert-success');
												previewModal?.close();
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

<PreviewModal {previewFile} bind:previewModalRef={previewModal} />
