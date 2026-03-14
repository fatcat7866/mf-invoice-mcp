import { z } from 'zod';
import { uploadReceipt } from '../../api/expense/receipts.js';

export const expenseReceiptTools = {
  mf_expense_upload_receipt: {
    description: 'レシート画像をアップロードします',
    inputSchema: z.object({
      office_id: z.string().describe('事業者ID'),
      file_path: z.string().describe('アップロードするファイルのパス'),
    }),
    handler: async (args: { office_id: string; file_path: string }) => {
      try {
        const result = await uploadReceipt(args.office_id, args.file_path);

        const files = result.mf_files?.map(f => f.name).join(', ') || '-';
        const txCount = result.ex_transactions?.length || 0;

        return {
          content: [
            {
              type: 'text' as const,
              text: `レシートをアップロードしました\n\nファイル: ${files}\n作成された明細数: ${txCount}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `エラー: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  },
};
