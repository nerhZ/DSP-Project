<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { ToastGenerator } from '$lib/toast.svelte.js';
	import { sidebarState } from '$lib/storage.svelte';
	import Home from '$lib/components/Home.svelte';
	import type { HomeProps } from '$lib/types';

	let toastGen = ToastGenerator();
	let { data }: { data: HomeProps } = $props();
	let pageSizeSelect: HTMLSelectElement | undefined = $state();
	let sidebarElement: HTMLInputElement | undefined = $state();
	let searchQuery: string | null = $state(null);

	$effect.pre(() => {
		if (data.pageSize) {
			if (pageSizeSelect) pageSizeSelect.value = data.pageSize.toString();
		}
	});

	$effect(() => {
		if (!sidebarElement) return;

		if (sidebarState.open) {
			sidebarElement.checked = true;
		} else {
			sidebarElement.checked = false;
		}
	});

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

<div class="drawer lg:drawer-open">
	<input id="sidebar" type="checkbox" class="drawer-toggle" bind:this={sidebarElement} />
	<div class="drawer-content flex max-w-full flex-col">
		<!-- Page content here -->
		<Home {data} bind:searchQuery />
	</div>
	<div class="drawer-side">
		<label for="sidebar" aria-label="close sidebar" class="drawer-overlay"></label>
		<ul
			class="menu bg-base-200 text-base-content lg:bg-base-100 border-base-300 min-h-full w-80 border-r-2 p-4"
		>
			<!-- Sidebar content here -->
			<li>
				<fieldset class="fieldset no-hover cursor-default">
					<legend class="fieldset-legend">Set a Page Length</legend>
					<select
						class="select cursor-pointer"
						onchange={setPageLengthCookie}
						bind:this={pageSizeSelect}
					>
						<option>10</option>
						<option>15</option>
						<option>20</option>
						<option>50</option>
						<option>100</option>
					</select>
				</fieldset>
			</li>
			<li>
				<fieldset class="fieldset no-hover cursor-default">
					<legend class="fieldset-legend">Search</legend>
					<div class="join">
						<label class="input join-item">
							<input type="text" placeholder="Type to Search" required bind:value={searchQuery} />
						</label>
						<button class="btn btn-primary join-item">Search</button>
					</div>
				</fieldset>
			</li>
		</ul>
	</div>
</div>

<style>
	select option:disabled {
		display: none;
	}

	.fieldset.no-hover {
		border: none;
		padding: 0;
		margin: 0;
	}
	.fieldset.no-hover:hover,
	.fieldset.no-hover:focus {
		background-color: transparent;
		outline: none;
		box-shadow: none;
	}
</style>
