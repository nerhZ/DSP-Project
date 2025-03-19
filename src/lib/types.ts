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
