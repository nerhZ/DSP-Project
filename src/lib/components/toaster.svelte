<script lang="ts">
	import type { Toast } from '$lib/types';
	import { fly, fade } from 'svelte/transition';
	import { ToastGenerator } from '$lib/toast.svelte';

	let toastGen = ToastGenerator();
</script>

<div class="toast toast-center toast-bottom z-50">
	{#each toastGen.toasts as toast: Toast (toast.id)}
		<div class="alert {toast.type}" out:fly={{ y: +50, duration: 250 }}>
			<span>{toast.message}</span>
		</div>
	{/each}
</div>
