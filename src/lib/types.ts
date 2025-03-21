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
	name: string;
	dataBase64: string;
	dataBlob: Blob;
	dataURL: string;
}
