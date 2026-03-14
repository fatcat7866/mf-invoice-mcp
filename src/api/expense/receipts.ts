import { getExpenseClient } from '../client.js';
import type { UploadReceiptResponse } from '../../types/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export async function uploadReceipt(officeId: string, filePath: string): Promise<UploadReceiptResponse> {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const formData = new FormData();
  const blob = new Blob([fileBuffer]);
  formData.append('receipt[file]', blob, fileName);

  return getExpenseClient().postFormData<UploadReceiptResponse>(
    `/offices/${officeId}/me/upload_receipt`,
    formData
  );
}
