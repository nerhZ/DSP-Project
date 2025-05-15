<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { ToastGenerator } from '$lib/toast.svelte';

	let toastGen = ToastGenerator();
	let { createFolderModalRef = $bindable(), parentId } = $props();
	let folderName: string | null = $state(null);

	function handleSubmit() {
		if (!folderName || folderName.trim() === '') {
			toastGen.addToast('Folder name cannot be empty.', 'alert-error');
			return;
		}
		console.log(folderName);
		createFolderModalRef.close();
	}
</script>

<dialog bind:this={createFolderModalRef} class="modal">
	<div class="modal-box">
		<form method="dialog">
			<button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
		</form>
		<h3 class="text-lg font-bold">Create New Folder</h3>
		<form
			method="post"
			action="/home?/createFolder"
			enctype="multipart/form-data"
			use:enhance={() => {
				return async ({ result }) => {
					switch (result.type) {
						case 'success':
							toastGen.addToast('Successfully created folder!', 'alert-success');
							createFolderModalRef.close();
							invalidateAll();
							break;
						case 'error':
							toastGen.addToast('Error creating folder, please try again.', 'alert-error');
							break;
						case 'failure':
							toastGen.addToast(
								'Failed to create folder, please try again. Likely due to not using standard characters (a-z, A-Z, 0-9) or a duplicate name.',
								'alert-error',
								7500
							);
							break;
					}
				};
			}}
			onsubmit={handleSubmit}
		>
			{#if parentId}
				<input type="hidden" name="parentId" value={parentId} />
				<!-- Using name="parentId" to be clear this is the parent of the folder being created -->
			{/if}
			<div class="form-control">
				<label class="label" for="folderName">
					<span class="label-text">Folder Name</span>
				</label>
				<input
					type="text"
					placeholder="e.g. Cat Pictures"
					class="input input-bordered"
					bind:value={folderName}
					name="folderName"
				/>
			</div>
			<div class="modal-action">
				<button type="submit" class="btn btn-primary">Create</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
