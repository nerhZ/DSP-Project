<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';

	let { data, children } = $props();
</script>

<Navbar {data} />

{@render children()}
