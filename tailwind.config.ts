import containerQueries from '@tailwindcss/container-queries';
import forms from '@tailwindcss/forms';
// import type { Config } from 'tailwindcss';
import daisyui from 'daisyui';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	daisyui: {
		themes: ['dark', 'light', 'cupcake']
	},
	plugins: [forms, containerQueries, daisyui]
};
