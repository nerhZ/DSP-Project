<script lang="ts">
	import emptyBox from '$lib/images/empty-white-box-svgrepo-com.svg'; // Make sure to replace this with the actual path to your image
	import downloadIcon from '$lib/images/download-svgrepo-com.svg';
	import audioIcon from '$lib/images/audio-library-svgrepo-com.svg';
	import videoIcon from '$lib/images/video-library-svgrepo-com.svg';
	import Bin from '$lib/images/bin-half-svgrepo-com.svg';
	import type { PageServerData } from './$types';
	import { enhance } from '$app/forms';
	import { ToastGenerator } from '$lib/toast.svelte';
	import { goto } from '$app/navigation';

	export let data: PageServerData;
	let toastGen = ToastGenerator();

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

	function isAudio(fileName: string): boolean {
		const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];
		return audioExtensions.includes(fileName.slice(fileName.lastIndexOf('.')).toLowerCase());
	}

	async function openVideoInNewTab(base64Data: string) {
		const blob = await fetch(`data:video/mp4;base64,${base64Data}`).then((res) => res.blob());
		const blobUrl = URL.createObjectURL(blob);
		window.open(blobUrl, '_blank', 'noopener,noreferrer');
	}
</script>

{#if data.files != undefined && data.files.length > 0}
	<div class="container mx-auto w-full md:w-11/12 lg:w-10/12 xl:w-4/5">
		<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
			{#each data.files as file}
				<div class="card bg-base-300 shadow-xl">
					<figure class="flex-col">
						{#if isImage(file.name)}
							<img src={`data:image/*;base64,${file.data}`} alt={file.name} class="h-auto w-full" />
						{:else if isVideo(file.name)}
							<button on:click={() => openVideoInNewTab(file.data)} class="h-auto w-full">
								<img src={videoIcon} alt="Video Icon" class="h-auto w-full" />
							</button>
						{:else if isAudio(file.name)}
							<img src={audioIcon} alt="Art depicting a music icon" class="h-auto w-full" />
							<audio controls class="h-auto w-full">
								<source src={`data:audio/*;base64,${file.data}`} type="audio/mpeg" />
								Your browser does not support the audio element.
							</audio>
						{:else}
							<p class="text-center">No preview available</p>
						{/if}
					</figure>
					<div class="card-body justify-center text-center">
						<h2 class="card-title text-center text-base">{file.name}</h2>
						<div class="card-actions justify-center">
							<a
								href={`data:application/octet-stream;base64,${file.data}`}
								download={file.name}
								class="mt-2 flex items-center justify-center text-center text-blue-500"
								aria-label="Download"
							>
								<img src={downloadIcon} width="35px" alt="Download Symbol" />
							</a>
							<form
								method="post"
								action="?/delete"
								use:enhance={() => {
									return async ({ update, result }) => {
										switch (result.type) {
											case 'success':
												toastGen.addToast('Successfully deleted file!', 'alert-success');
												break;
											case 'error':
												toastGen.addToast(
													// @ts-ignore
													result?.message ?? 'An error occurred while deleting the file.',
													'alert-error'
												);
												break;
										}
										await update();
									};
								}}
							>
								<button>
									<img src={Bin} alt="Delete" width="35px" class="mt-2" />
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
