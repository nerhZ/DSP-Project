<script lang="ts">
	import { enhance } from '$app/forms';
	import { ToastGenerator } from '$lib/toast.svelte';
	import uploadImage from '$lib/images/upload-svgrepo-com.svg';
	import { invalidateAll } from '$app/navigation';
	import { parentFolder } from '$lib/storage.svelte';

	let toastGen = ToastGenerator();
	let { uploadModal = $bindable() } = $props();
	let fileInput: HTMLInputElement;
	let selectedFiles: File[] = $state([]);
	let uploadedImage: string | null = $state(null);
	let uploadSubmit: HTMLButtonElement;

	function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;

		if (input.files && input.files.length > 10) {
			toastGen.addToast('Cannot upload more than 10 files at once.', 'alert-error');
			fileInput.value = '';
			return;
		}

		if (input.files && input.files.length == 1) {
			let selectedFile = input.files[0];
			if (selectedFile.type.startsWith('image/')) {
				const reader = new FileReader();
				reader.onload = (e) => {
					uploadedImage = e.target?.result as string;
				};
				reader.readAsDataURL(selectedFile);
			} else {
				uploadedImage = null;
			}
		} else {
			uploadedImage = null;
		}
		if (input.files) selectedFiles = Array.from(input.files);
	}
</script>

<!-- Open the modal using ID.showModal() method -->
<dialog bind:this={uploadModal} class="modal">
	<div class="modal-box">
		<form method="dialog">
			<button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
		</form>
		<h3 class="text-lg font-bold">Upload a File (or files)</h3>
		<form
			method="post"
			action="/home?/upload"
			enctype="multipart/form-data"
			use:enhance={() => {
				uploadSubmit.disabled = true;
				return async ({ update, result }) => {
					switch (result.type) {
						case 'success':
							toastGen.addToast('Successfully uploaded file(s)!', 'alert-success');
							uploadModal.close();
							uploadedImage = null;
							selectedFiles = [];
							invalidateAll();
							break;
						case 'error':
							toastGen.addToast('Error uploading file, please try again.', 'alert-error');
							break;
						case 'failure':
							toastGen.addToast(
								'Failed to upload file. Likely due to a disallowed file type - or the file exceeds the file limit. Please try again.',
								'alert-error'
							);
					}
					// Don't need to re-enable the button since the button's state relies on uploadedFile.
					await update({ invalidateAll: true });
				};
			}}
		>
			{#if parentFolder.id}
				<input type="hidden" name="parentId" value={parentFolder.id} />
			{/if}
			<div class="flex flex-col items-center">
				<input
					type="file"
					name="file"
					class="hidden"
					bind:this={fileInput}
					onchange={handleFileChange}
					multiple
				/>
				<button onclick={() => fileInput.click()} type="button">
					<img
						src={uploadedImage ? uploadedImage : uploadImage}
						width="250px"
						alt="Upload files symbol"
						class="cursor-pointer"
					/>
				</button>
				{#if selectedFiles.length === 1}
					<p class="mt-2 text-center">
						Current file: <span class="font-bold">{selectedFiles[0].name}</span>
					</p>
				{:else if selectedFiles.length > 1}
					<p class="mt-2 text-center">
						Current files:
						{#each selectedFiles as file, index}
							<span class="font-bold">
								{file.name}{index < selectedFiles.length - 1 ? ', ' : ''}
							</span>
						{/each}
					</p>
				{:else}
					<p class="mt-2 text-center">Click the image above to upload a file!</p>
				{/if}
				<button
					class="btn btn-primary mt-4"
					bind:this={uploadSubmit}
					type="submit"
					disabled={selectedFiles.length === 0}
					onsubmit={() => {
						uploadedImage = null;
					}}
				>
					Confirm Upload
				</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
