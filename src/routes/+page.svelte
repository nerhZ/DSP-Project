<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import { ToastGenerator } from '$lib/toast.svelte';
	import { goto } from '$app/navigation';

	let { form }: { form: ActionData } = $props();
	let toastGen = ToastGenerator();
</script>

<div class="flex h-screen items-center justify-center">
	<div class="card bg-base-300 w-96 shadow-xl">
		<div class="card-body">
			<h2 class="card-title">Login</h2>
			<form
				method="post"
				action="?/login"
				use:enhance={() => {
					return async ({ update, result }) => {
						if (result.type == 'success') {
							toastGen.addToast('Successfully logged in!', 'alert-success');
							goto('/home');
						}
						await update();
					};
				}}
			>
				<div class="form-control">
					<label class="label" for="username">
						<span class="label-text">Username</span>
					</label>
					<input type="text" name="username" class="input" placeholder="Username" required />
					<label class="label" for="password">
						<span class="label-text">Password</span>
					</label>
					<input type="password" name="password" class="input" placeholder="Password" required />
					<div class="card-actions justify-center">
						<button type="submit" class="btn btn-primary mt-5">Login</button>
					</div>
					<p style="color: red" class="text-center">{form?.message ?? ''}</p>
					<div class="mt-2 text-center">
						<p>Need to register an account?</p>
						<a href="/register" class="link">Register here</a>
					</div>
				</div>
			</form>
		</div>
	</div>
</div>
