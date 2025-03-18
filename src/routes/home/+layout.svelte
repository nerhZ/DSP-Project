<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	let { data, children } = $props();

	// function toggleSidebar() {
	// 	if (sidebarElement) sidebarElement.checked = !sidebarElement.checked;
	// }
</script>

<Navbar {data} />

{@render children()}
