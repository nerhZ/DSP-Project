<script lang="ts">
	import type { PageServerData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageServerData;
</script>

<p>You made it home!</p>
<p>Welcome user {data.user.username}, your ID is {data.user.id}.</p>
