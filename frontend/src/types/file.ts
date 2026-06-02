export type FileType = 'PDF' | 'DOCX' | 'IMAGE';
export type FileStatus = 'PENDING' | 'VERIFIED' | 'DONE' | 'FAILED';

export interface FileRecord {
  cloudinary_public_id: string;
  original_filename: string;
  file_type: FileType;
}
