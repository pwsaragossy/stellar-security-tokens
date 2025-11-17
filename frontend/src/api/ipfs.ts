import api from './client';
import type { ApiResponse } from '@/types';

export const ipfsApi = {
  upload: async (file: File): Promise<ApiResponse<{ hash: string; url: string }>> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/ipfs/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  uploadMultiple: async (files: File[]): Promise<ApiResponse<Array<{ hash: string; url: string }>>> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    
    const response = await api.post('/ipfs/upload-multiple', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

