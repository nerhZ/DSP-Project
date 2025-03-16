<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import { ToastGenerator } from '$lib/toast.svelte.js';
	let sidebarElement: HTMLInputElement | undefined = $state();
	let { data, children } = $props();
	let toastGen = ToastGenerator();
	let pageSizeSelect: HTMLSelectElement | undefined = $state();
	import { invalidateAll } from '$app/navigation';

	function toggleSidebar() {
		if (sidebarElement) sidebarElement.checked = !sidebarElement.checked;
	}

	async function setPageLengthCookie() {
		try {
			if (!pageSizeSelect) {
				toastGen.addToast('Failed to set page size. Please try again.', 'alert-error');
				return;
			}

			const pageSize = pageSizeSelect.value;
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
				invalidateAll();
			} else {
				toastGen.addToast(result.body.message, 'alert-error');
			}
		} catch (error) {
			console.error('Error fetching page:', error);
			toastGen.addToast('Failed to set page size. Please try again.', 'alert-error');
		}
	}
</script>

<Navbar {data} {toggleSidebar} />

<div class="drawer lg:drawer-open">
	<input id="sidebar" type="checkbox" class="drawer-toggle" bind:this={sidebarElement} />
	<div class="drawer-content flex max-w-full flex-col">
		<!-- Page content here -->
		{@render children()}
	</div>
	<div class="drawer-side">
		<label for="sidebar" aria-label="close sidebar" class="drawer-overlay"></label>
		<ul
			class="menu bg-base-200 text-base-content lg:bg-base-100 border-base-300 min-h-full w-80 border-r-2 p-4"
		>
			<!-- Sidebar content here -->
			<li>
				<select class="select" onchange={setPageLengthCookie} bind:this={pageSizeSelect}>
					<option disabled selected>Pick files per page</option>
					<option>10</option>
					<option>20</option>
					<option>50</option>
					<option>100</option>
				</select>
			</li>
		</ul>
	</div>
</div>

<style>
	select option:disabled {
		display: none;
	}
</style>
