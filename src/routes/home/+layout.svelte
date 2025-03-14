<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	let sidebarElement: HTMLInputElement | undefined = $state();
	let { data, children } = $props();

	function toggleSidebar() {
		if (sidebarElement) sidebarElement.checked = !sidebarElement.checked;
	}
</script>

<Navbar {data} {toggleSidebar} />

<div class="drawer lg:drawer-open">
	<input id="sidebar" type="checkbox" class="drawer-toggle" bind:this={sidebarElement} />
	<div class="drawer-content flex max-w-full flex-col items-center justify-center">
		<!-- Page content here -->
		{@render children()}
	</div>
	<div class="drawer-side">
		<label for="sidebar" aria-label="close sidebar" class="drawer-overlay"></label>
		<ul
			class="menu bg-base-200 text-base-content lg:bg-base-100 border-base-300 min-h-full w-80 border-r-2 p-4"
		>
			<!-- Sidebar content here -->
			<li><a>Sidebar Item 1</a></li>
			<li><a>Sidebar Item 2</a></li>
		</ul>
	</div>
</div>
