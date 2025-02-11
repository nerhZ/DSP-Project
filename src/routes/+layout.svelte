<script lang="ts">
	import '../app.css';
	import Toaster from '$lib/components/Toaster.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<title>Storage System</title>
</svelte:head>

<Toaster />

{@render children()}
