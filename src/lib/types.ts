export type Toast = {
	id: string;
	message: string;
	type: string;
	duration: number;
};

export interface HomeProps {
	files: {
		id: number;
		userId: string;
		filename: string;
		extension: string;
		mimetype: string;
		uploadedAt: Date;
		fileSize: number;
	}[];
	pageSize: number;
	noOfPages: number;
	totalFiles?: number;
}

export interface previewFileType {
	id: number;
	name: string;
	dataBase64: string;
	dataBlob: Blob;
	dataURL: string;
}

export type CheckedItem = {
	id: number | string; // Use the database ID for uniqueness
	name: string; // Keep the name for potential display or confirmation messages
	type: 'file' | 'folder';
};
