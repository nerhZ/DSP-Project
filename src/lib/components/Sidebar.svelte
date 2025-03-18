<!-- src/lib/components/Sidebar.svelte -->
<script lang="ts">
	// You will likely have some props here for different options/links
	// example:
	export let activeRoute: string;
</script>

<aside class="min-h-screen w-64 bg-gray-800 text-white">
	<div class="p-4">
		<h2 class="text-2xl font-bold">My App</h2>
	</div>

	<nav>
		<ul class="mt-4">
			<li>
				<a
					href="/home"
					class="block px-4 py-2 hover:bg-gray-700 {activeRoute === '/home' ? 'bg-gray-700' : ''}"
					>Home</a
				>
			</li>
			<li>
				<a
					href="/settings"
					class="block px-4 py-2 hover:bg-gray-700 {activeRoute === '/settings'
						? 'bg-gray-700'
						: ''}">Settings</a
				>
			</li>
			<!-- Add more links as needed -->
		</ul>
	</nav>
</aside>

<style>
</style>
