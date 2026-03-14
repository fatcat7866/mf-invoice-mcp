import { z } from 'zod';
import {
  listBillings,
  getBilling,
  createInvoiceTemplateBilling,
  createBillingFromQuote,
  updateBilling,
  updatePaymentStatus,
  downloadBillingPdf,
} from '../../api/invoice/billings.js';
import { listPartnerDepartments } from '../../api/invoice/partners.js';
import type { PaymentStatus, LineItem, InvoiceTemplateLineItem } from '../../types/index.js';

const lineItemSchema = z.object({
  name: z.string().describe('品目名'),
  code: z.string().optional().describe('品目コード'),
  detail: z.string().optional().describe('詳細・摘要'),
  unit: z.string().optional().describe('単位'),
  price: z.number().describe('単価'),
  quantity: z.number().describe('数量'),
  is_deduct_withholding_tax: z.boolean().optional().describe('源泉徴収対象'),
  excise: z.string().optional().describe('消費税区分'),
});

const invoiceTemplateLineItemSchema = z.object({
  item_id: z.string().optional().describe('品目ID（マスタから選択する場合）'),
  name: z.string().optional().describe('品目名'),
  delivery_number: z.string().optional().describe('納品番号'),
  delivery_date: z.string().optional().describe('納品日（YYYY-MM-DD）'),
  detail: z.string().optional().describe('詳細・摘要'),
  unit: z.string().optional().describe('単位'),
  price: z.number().describe('単価'),
  quantity: z.number().describe('数量'),
  is_deduct_withholding_tax: z.boolean().optional().describe('源泉徴収対象（個人事業主のみ）'),
  excise: z.enum(['untaxable', 'non_taxable', 'tax_exemption', 'five_percent', 'eight_percent', 'eight_percent_as_reduced_tax_rate', 'ten_percent']).describe('消費税区分（ten_percent: 10%, eight_percent_as_reduced_tax_rate: 軽減8%）'),
});

const paymentStatusLabels: Record<PaymentStatus, string> = {
  unsettled: '未入金',
  settled: '入金済み',
};

export const billingTools = {
  mf_list_billings: {
    description: '請求書一覧を取得します。取引先や期間で絞り込み可能です。',
    inputSchema: z.object({
      page: z.number().optional().describe('ページ番号'),
      per_page: z.number().optional().describe('1ページあたりの件数'),
      partner_id: z.string().optional().describe('取引先IDで絞り込み'),
      payment_status: z
        .enum(['unsettled', 'settled'])
        .optional()
        .describe('入金状態で絞り込み'),
      from: z.string().optional().describe('請求日の開始日（YYYY-MM-DD）'),
      to: z.string().optional().describe('請求日の終了日（YYYY-MM-DD）'),
      q: z.string().optional().describe('検索キーワード'),
    }),
    handler: async (args: {
      page?: number;
      per_page?: number;
      partner_id?: string;
      payment_status?: PaymentStatus;
      from?: string;
      to?: string;
      q?: string;
    }) => {
      try {
        const result = await listBillings(args);

        const billingsText = result.data
          .map(
            (b) =>
              `- ${b.billing_number || 'No.'}\n  ${b.partner_name || '取引先未設定'}\n  タイトル: ${b.title || '-'}\n  請求日: ${b.billing_date || '-'}\n  支払期限: ${b.due_date || '-'}\n  合計: ¥${(b.total_price ?? 0).toLocaleString()}\n  入金状態: ${paymentStatusLabels[b.payment_status] || b.payment_status}\n  ID: ${b.id}`
          )
          .join('\n\n');

        return {
          content: [
            {
              type: 'text' as const,
              text: `請求書一覧 (${result.pagination.current_page}/${result.pagination.total_pages}ページ, 全${result.pagination.total_count}件)\n\n${billingsText || '請求書が見つかりません'}`,
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

  mf_get_billing: {
    description: '請求書の詳細情報を取得します',
    inputSchema: z.object({
      billing_id: z.string().describe('請求書ID'),
    }),
    handler: async (args: { billing_id: string }) => {
      try {
        const billing = await getBilling(args.billing_id);

        const itemsText = billing.items
          .map(
            (i, idx) =>
              `  ${idx + 1}. ${i.name}\n     単価: ¥${i.price.toLocaleString()} × ${i.quantity}${i.unit || ''} = ¥${(i.price * i.quantity).toLocaleString()}`
          )
          .join('\n');

        return {
          content: [
            {
              type: 'text' as const,
              text: `請求書詳細\n\n請求番号: ${billing.billing_number || '-'}\nID: ${billing.id}\n取引先: ${billing.partner_name || '-'}\nタイトル: ${billing.title || '-'}\n請求日: ${billing.billing_date || '-'}\n売上日: ${billing.sales_date || '-'}\n支払期限: ${billing.due_date || '-'}\n入金状態: ${paymentStatusLabels[billing.payment_status] || billing.payment_status}\n支払条件: ${billing.payment_condition || '-'}\n\n【明細】\n${itemsText || '明細なし'}\n\n小計: ¥${(billing.subtotal ?? 0).toLocaleString()}\n消費税: ¥${(billing.tax ?? 0).toLocaleString()}\n合計: ¥${(billing.total_price ?? 0).toLocaleString()}\n\nメモ: ${billing.memo || '-'}\n\n作成日: ${billing.created_at}\n更新日: ${billing.updated_at}`,
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

  mf_create_billing: {
    description: 'インボイス制度対応の請求書を作成します',
    inputSchema: z.object({
      partner_id: z.string().describe('取引先ID（必須）'),
      title: z.string().optional().describe('請求書タイトル'),
      memo: z.string().optional().describe('メモ'),
      payment_condition: z.string().optional().describe('支払条件'),
      billing_date: z.string().describe('請求日（YYYY-MM-DD）'),
      due_date: z.string().optional().describe('支払期限（YYYY-MM-DD）'),
      sales_date: z.string().optional().describe('売上日（YYYY-MM-DD）'),
      items: z.array(invoiceTemplateLineItemSchema).describe('明細行'),
    }),
    handler: async (args: {
      partner_id: string;
      title?: string;
      memo?: string;
      payment_condition?: string;
      billing_date: string;
      due_date?: string;
      sales_date?: string;
      items: InvoiceTemplateLineItem[];
    }) => {
      try {
        // 取引先の部署一覧を取得してdepartment_idを取得
        const departments = await listPartnerDepartments(args.partner_id);
        if (!departments.data || departments.data.length === 0) {
          throw new Error('取引先に部署が登録されていません。取引先設定を確認してください。');
        }
        const departmentId = departments.data[0].id;

        // インボイス制度対応の請求書を作成
        const billing = await createInvoiceTemplateBilling({
          department_id: departmentId,
          billing_date: args.billing_date,
          due_date: args.due_date,
          sales_date: args.sales_date,
          title: args.title,
          memo: args.memo,
          payment_condition: args.payment_condition,
          items: args.items,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `請求書を作成しました\n\n請求番号: ${billing.billing_number || '-'}\nID: ${billing.id}\n取引先: ${billing.partner_name || '-'}\n合計: ¥${(billing.total_price ?? 0).toLocaleString()}`,
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

  mf_create_billing_from_quote: {
    description: '見積書から請求書を作成します',
    inputSchema: z.object({
      quote_id: z.string().describe('元となる見積書のID'),
      billing_date: z.string().optional().describe('請求日（YYYY-MM-DD）'),
      due_date: z.string().optional().describe('支払期限（YYYY-MM-DD）'),
      sales_date: z.string().optional().describe('売上日（YYYY-MM-DD）'),
      title: z.string().optional().describe('請求書タイトル'),
      memo: z.string().optional().describe('メモ'),
      payment_condition: z.string().optional().describe('支払条件'),
    }),
    handler: async (args: {
      quote_id: string;
      billing_date?: string;
      due_date?: string;
      sales_date?: string;
      title?: string;
      memo?: string;
      payment_condition?: string;
    }) => {
      try {
        const billing = await createBillingFromQuote(args);

        return {
          content: [
            {
              type: 'text' as const,
              text: `見積書から請求書を作成しました\n\n請求番号: ${billing.billing_number || '-'}\nID: ${billing.id}\n取引先: ${billing.partner_name || '-'}\n合計: ¥${(billing.total_price ?? 0).toLocaleString()}`,
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

  mf_update_billing: {
    description: '請求書を更新します',
    inputSchema: z.object({
      billing_id: z.string().describe('請求書ID'),
      partner_id: z.string().optional().describe('取引先ID'),
      partner_name: z.string().optional().describe('取引先名'),
      partner_detail: z.string().optional().describe('取引先の詳細'),
      title: z.string().optional().describe('請求書タイトル'),
      memo: z.string().optional().describe('メモ'),
      payment_condition: z.string().optional().describe('支払条件'),
      billing_date: z.string().optional().describe('請求日（YYYY-MM-DD）'),
      due_date: z.string().optional().describe('支払期限（YYYY-MM-DD）'),
      sales_date: z.string().optional().describe('売上日（YYYY-MM-DD）'),
      items: z.array(lineItemSchema).optional().describe('明細行（指定時は全置換）'),
    }),
    handler: async (args: {
      billing_id: string;
      partner_id?: string;
      partner_name?: string;
      partner_detail?: string;
      title?: string;
      memo?: string;
      payment_condition?: string;
      billing_date?: string;
      due_date?: string;
      sales_date?: string;
      items?: LineItem[];
    }) => {
      try {
        const { billing_id, ...params } = args;
        const billing = await updateBilling(billing_id, params);

        return {
          content: [
            {
              type: 'text' as const,
              text: `請求書を更新しました\n\n請求番号: ${billing.billing_number || '-'}\nID: ${billing.id}\n取引先: ${billing.partner_name || '-'}\n合計: ¥${(billing.total_price ?? 0).toLocaleString()}`,
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

  mf_update_payment_status: {
    description: '請求書の入金状態を更新します',
    inputSchema: z.object({
      billing_id: z.string().describe('請求書ID'),
      payment_status: z.enum(['unsettled', 'settled']).describe('入金状態'),
    }),
    handler: async (args: { billing_id: string; payment_status: PaymentStatus }) => {
      try {
        const billing = await updatePaymentStatus(args);

        return {
          content: [
            {
              type: 'text' as const,
              text: `入金状態を更新しました\n\n請求番号: ${billing.billing_number || '-'}\n入金状態: ${paymentStatusLabels[billing.payment_status] || billing.payment_status}`,
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

  mf_download_billing_pdf: {
    description: '請求書のPDF URLを取得します',
    inputSchema: z.object({
      billing_id: z.string().describe('請求書ID'),
    }),
    handler: async (args: { billing_id: string }) => {
      try {
        const result = await downloadBillingPdf(args.billing_id);

        return {
          content: [
            {
              type: 'text' as const,
              text: `請求書PDF URL:\n${result.pdf_url}`,
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
