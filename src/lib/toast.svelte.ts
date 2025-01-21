import type { Toast } from './types';

let toasts = $state<Toast[]>([]);

export function ToastGenerator() {
	function addToast(message: string, type: string, duration: number = 3000) {
		const id = crypto.randomUUID();
		toasts.push({ id, message, type, duration });

		setTimeout(() => {
			removeToast(id);
		}, duration);
	}

	function removeToast(id: string) {
		toasts = toasts.filter((toast) => toast.id !== id);
	}

	return {
		get toasts() {
			return toasts;
		},
		addToast
	};
}
