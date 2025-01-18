<script lang="ts">
	import type { PageServerData } from './$types';
	import { enhance } from '$app/forms';

	let { data }: { data: PageServerData } = $props();
</script>

<p>You made it home!</p>
<p>Welcome user {data.user.username}, your ID is {data.user.id}.</p>
<form method="post" action="?/logout" use:enhance>
	<button class="btn btn-sm btn-primary">Sign out</button>
</form>
