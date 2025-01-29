<script lang="ts">
	import type { LayoutServerData } from './$types';
	import { enhance } from '$app/forms';
	import { ToastGenerator } from '$lib/toast.svelte';
	import { goto } from '$app/navigation';
	import uploadImage from '$lib/images/upload-svgrepo-com.svg';

	export let data: LayoutServerData;
	export let children: any;

	let toastGen = ToastGenerator();
	let uploadModal: HTMLDialogElement;
	let fileInput: HTMLInputElement;
	let selectedFile: File | null = null;
	let uploadedImage: string | null = null;
	let uploadSubmit: HTMLButtonElement;

	function openModal(modal: HTMLDialogElement) {
		modal.showModal();
	}

	function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			selectedFile = input.files[0];
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
	}
</script>

<div class="navbar">
	<div class="navbar-start">
		<div class="dropdown">
			<div tabindex="0" role="button" class="btn btn-ghost lg:hidden">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 6h16M4 12h8m-8 6h16"
					/>
				</svg>
			</div>
			<ul
				class="menu menu-sm dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow"
			></ul>
		</div>
		<a class="btn btn-ghost text-xl" href="/home">Home</a>
	</div>
	<div class="navbar-center hidden lg:flex">
		<ul class="menu menu-horizontal px-1"></ul>
	</div>
	<div class="navbar-end">
		<button class="btn btn-sm btn-ghost btn-primary me-1" onclick={() => openModal(uploadModal)}
			><img src={uploadImage} width="25px" alt="Upload files symbol" /></button
		>
		<p class="me-3">{data.user?.username}</p>
		<form
			method="POST"
			action="/api/logout"
			use:enhance={() => {
				return async ({ update, result }) => {
					switch (result.type) {
						case 'success':
							toastGen.addToast('Successfully signed out!', 'alert-success');
							await goto('/');
							break;
						case 'error':
							toastGen.addToast('Error signing out, please refresh page.', 'alert-error');
							break;
					}
					await update();
				};
			}}
		>
			<button class="btn btn-sm btn-primary">Sign out</button>
		</form>
	</div>
</div>
<div class="border-base-300 m-auto mb-5 w-10/12 border-b-2"></div>

{@render children()}

<!-- Open the modal using ID.showModal() method -->
<dialog bind:this={uploadModal} class="modal">
	<div class="modal-box">
		<form method="dialog">
			<button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
		</form>
		<h3 class="text-lg font-bold">Upload a File</h3>
		<form
			method="post"
			action="/home?/upload"
			enctype="multipart/form-data"
			use:enhance={() => {
				uploadSubmit.disabled = true;
				return async ({ update, result }) => {
					switch (result.type) {
						case 'success':
							toastGen.addToast('Successfully uploaded file!', 'alert-success');
							uploadModal.close();
							uploadedImage = null;
							selectedFile = null;
							break;
						case 'error':
							toastGen.addToast('Error uploading file, please try again.', 'alert-error');
							break;
					}
					// Don't need to re-enable the button since the button's state relies on uploadedFile.
					await update({ invalidateAll: true });
				};
			}}
		>
			<div class="flex flex-col items-center">
				<input
					type="file"
					name="file"
					class="hidden"
					bind:this={fileInput}
					onchange={handleFileChange}
				/>
				<button onclick={() => fileInput.click()} type="button">
					<img
						src={uploadedImage ? uploadedImage : uploadImage}
						width="250px"
						alt="Upload files symbol"
					/>
				</button>
				{#if selectedFile}
					<p class="mt-2 text-center">
						Current file: <span class="font-bold">{selectedFile.name}</span>
					</p>
				{:else}
					<p class="mt-2 text-center">Click the image above to upload a file!</p>
				{/if}
				<button
					class="btn btn-primary mt-4"
					bind:this={uploadSubmit}
					type="submit"
					disabled={!selectedFile}
					onsubmit={() => {
						uploadedImage = null;
					}}>Confirm Upload</button
				>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
