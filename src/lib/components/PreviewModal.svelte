<script lang="ts">
	import { ToastGenerator } from '$lib/toast.svelte';
	import { enhance } from '$app/forms';
	import downloadIcon from '$lib/images/download-svgrepo-com.svg';
	import Bin from '$lib/images/bin-half-svgrepo-com.svg';
	import mime from 'mime';

	let { previewModalRef = $bindable(), previewFile } = $props();

	let toastGen = ToastGenerator();
	let textContent: string | null = $state(null);

	$effect(() => {
		async function loadTextContent() {
			if (previewFile && mime.getType(previewFile.name)?.startsWith('text/')) {
				try {
					const response = await fetch(previewFile.dataURL);
					textContent = await response.text();
				} catch (error) {
					console.error('Error fetching text content:', error);
					textContent = 'Error loading preview.';
				}
			} else {
				textContent = null;
			}
		}
		loadTextContent();
	});
</script>

<dialog
	bind:this={previewModalRef}
	class="modal min-w-full"
	class:pdf-modal={previewFile && mime.getType(previewFile.name) == 'application/pdf'}
>
	<div class="modal-box max-h-[90vh] w-full overflow-hidden md:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
		<form method="dialog">
			<button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
			<h3 class="text-lg font-bold">File Preview</h3>
			<div
				class="flex flex-col items-center overflow-hidden object-cover"
				class:height-non-pdf={previewFile && mime.getType(previewFile.name) != 'application/pdf'}
			>
				{#if previewFile}
					{#if mime.getType(previewFile.name)?.startsWith('image/')}
						<img src={previewFile?.dataURL} alt={previewFile.name} class="max-h-[75vh]" />
					{:else if mime.getType(previewFile.name)?.startsWith('video/')}
						<!-- svelte-ignore -->
						<video controls class="h-auto w-full">
							<source
								src={previewFile?.dataURL}
								type={mime.getType(previewFile.name) || 'video/mp4'}
							/>
							<track kind="captions" src="" srclang="en" default />
						</video>
					{:else if mime.getType(previewFile.name)?.startsWith('audio/')}
						<audio controls>
							<source
								src={previewFile?.dataURL}
								type={mime.getType(previewFile.name) || 'audio/mpeg'}
							/>
						</audio>
					{:else if mime.getType(previewFile.name) == 'application/pdf'}
						<embed
							src={previewFile?.dataURL}
							type="application/pdf"
							class="w-full"
							style="height: calc(100vh - 125px)"
						/>
					{:else if mime.getType(previewFile.name)?.startsWith('text/')}
						<pre
							class="max-h-[75vh] w-full overflow-auto whitespace-pre-wrap p-4 text-left">{textContent ??
								'Loading...'}</pre>
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
							previewModalRef.close();
							break;
						case 'error':
							toastGen.addToast(
								result.error?.message ?? 'An error occurred while deleting the file.',
								'alert-error'
							);
							break;
					}
					await update({ invalidateAll: true });
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
					<input type="hidden" name="file" value={previewFile?.id} />
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

	.height-non-pdf {
		max-height: 75vh;
	}
</style>
