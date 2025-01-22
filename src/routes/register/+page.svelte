<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';
	import { ToastGenerator } from '$lib/toast.svelte';
	import { goto } from '$app/navigation';

	let toastGen = ToastGenerator();
	let { form }: { form: ActionData } = $props();
</script>

<div class="flex h-screen items-center justify-center">
	<div class="card bg-base-300 w-96 shadow-xl">
		<div class="card-body">
			<h2 class="card-title">Register</h2>
			<form
				method="post"
				action="?/register"
				use:enhance={() => {
					return async ({ update, result }) => {
						console.log(result.type);
						if (result.type == 'success') {
							toastGen.addToast('Successfully registered account & signed in!', 'alert-success');
							await goto('/home');
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
						<button type="submit" class="btn btn-primary mt-5">Register</button>
					</div>
					<p style="color: red" class="text-center">{form?.message ?? ''}</p>
					<div class="mt-2 text-center">
						<p>Already have an account?</p>
						<a href="/" class="link">Login here</a>
					</div>
				</div>
			</form>
		</div>
	</div>
</div>
