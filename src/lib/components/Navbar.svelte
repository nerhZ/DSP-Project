<script lang="ts">
	import { enhance } from '$app/forms';
	import { ToastGenerator } from '$lib/toast.svelte';
	import { goto } from '$app/navigation';
	import uploadImage from '$lib/images/upload-svgrepo-com.svg';
	import UploadModal from '$lib/components/UploadModal.svelte';

	let toastGen = ToastGenerator();
	let { data, toggleSidebar } = $props();

	let uploadModalRef: HTMLDialogElement | undefined = $state();
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
		<button onclick={toggleSidebar} class="btn btn-sm btn-primary lg:hidden">
			Open Filter/Search
		</button>
		<button
			class="btn btn-sm btn-ghost btn-primary me-1"
			onclick={() => uploadModalRef?.showModal()}
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

<UploadModal bind:uploadModal={uploadModalRef} />
