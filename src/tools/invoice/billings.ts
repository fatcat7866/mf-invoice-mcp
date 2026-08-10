import { z } from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  listBillings,
  getBilling,
  createInvoiceTemplateBilling,
  createBillingFromQuote,
  updateBilling,
  updatePaymentStatus,
  downloadBillingPdf,
  addBillingItem,
  deleteBillingItem,
} from '../../api/invoice/billings.js';
import { listPartnerDepartments } from '../../api/invoice/partners.js';
import type { PaymentStatus, InvoiceTemplateLineItem, AddBillingItemParams } from '../../types/index.js';
import { yen } from '../../utils/format.js';

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

// MF v3 は payment_status を "0"/"1"/"2" で返す場合と、名前付きで返す場合がある。
// どちらでも読めるようにし、未知の値は素通しする。
const paymentStatusLabels: Record<string, string> = {
  '0': '未設定',
  '1': '未入金',
  '2': '入金済み',
  unset: '未設定',
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
              `- ${b.billing_number || 'No.'}\n  ${b.partner_name || '取引先未設定'}\n  タイトル: ${b.title || '-'}\n  請求日: ${b.billing_date || '-'}\n  支払期限: ${b.due_date || '-'}\n  合計: ${yen((b.total_price ?? 0))}\n  入金状態: ${paymentStatusLabels[b.payment_status] || b.payment_status}\n  ID: ${b.id}`
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
              `  ${idx + 1}. ${i.name}\n     単価: ${yen(i.price)} × ${i.quantity}${i.unit || ''} = ${yen((i.price * i.quantity))}`
          )
          .join('\n');

        return {
          content: [
            {
              type: 'text' as const,
              text: `請求書詳細\n\n請求番号: ${billing.billing_number || '-'}\nID: ${billing.id}\n取引先: ${billing.partner_name || '-'}\nタイトル: ${billing.title || '-'}\n請求日: ${billing.billing_date || '-'}\n売上日: ${billing.sales_date || '-'}\n支払期限: ${billing.due_date || '-'}\n入金状態: ${paymentStatusLabels[billing.payment_status] || billing.payment_status}\n支払条件: ${billing.payment_condition || '-'}\n\n【明細】\n${itemsText || '明細なし'}\n\n小計: ${yen((billing.subtotal ?? 0))}\n消費税: ${yen((billing.tax ?? 0))}\n合計: ${yen((billing.total_price ?? 0))}\n\nメモ: ${billing.memo || '-'}\n\n作成日: ${billing.created_at}\n更新日: ${billing.updated_at}`,
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
              text: `請求書を作成しました\n\n請求番号: ${billing.billing_number || '-'}\nID: ${billing.id}\n取引先: ${billing.partner_name || '-'}\n合計: ${yen((billing.total_price ?? 0))}`,
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
              text: `見積書から請求書を作成しました\n\n請求番号: ${billing.billing_number || '-'}\nID: ${billing.id}\n取引先: ${billing.partner_name || '-'}\n合計: ${yen((billing.total_price ?? 0))}`,
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
    description: '請求書のヘッダ情報（タイトル・日付・メモ等）を更新します。明細の変更は mf_add_billing_item / mf_delete_billing_item を使ってください',
    inputSchema: z.object({
      billing_id: z.string().describe('請求書ID'),
      title: z.string().optional().describe('請求書タイトル'),
      memo: z.string().optional().describe('メモ'),
      payment_condition: z.string().optional().describe('支払条件'),
      billing_date: z.string().optional().describe('請求日（YYYY-MM-DD）'),
      due_date: z.string().optional().describe('支払期限（YYYY-MM-DD）'),
      sales_date: z.string().optional().describe('売上日（YYYY-MM-DD）'),
      billing_number: z.string().optional().describe('請求番号'),
      note: z.string().optional().describe('備考'),
      document_name: z.string().optional().describe('文書名'),
      tag_names: z.array(z.string()).optional().describe('タグ名'),
    }),
    handler: async (args: {
      billing_id: string;
      title?: string;
      memo?: string;
      payment_condition?: string;
      billing_date?: string;
      due_date?: string;
      sales_date?: string;
      billing_number?: string;
      note?: string;
      document_name?: string;
      tag_names?: string[];
    }) => {
      try {
        const { billing_id, ...params } = args;
        const billing = await updateBilling(billing_id, params);

        return {
          content: [
            {
              type: 'text' as const,
              text: `請求書を更新しました\n\n請求番号: ${billing.billing_number || '-'}\nID: ${billing.id}\n取引先: ${billing.partner_name || '-'}\n合計: ${yen((billing.total_price ?? 0))}`,
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
      payment_status: z.enum(['unset', 'unsettled', 'settled']).describe('入金状態（unset: 未設定, unsettled: 未入金, settled: 入金済み）'),
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
    description: '請求書のPDFをダウンロードしてローカルに保存します（save_path省略時は ~/Desktop に請求番号名で保存）',
    inputSchema: z.object({
      billing_id: z.string().describe('請求書ID'),
      save_path: z
        .string()
        .optional()
        .describe('保存先の絶対パス（.pdf）。省略時は ~/Desktop/<請求番号>.pdf'),
    }),
    handler: async (args: { billing_id: string; save_path?: string }) => {
      try {
        const result = await downloadBillingPdf(args.billing_id);

        const defaultName = `${result.billing_number || args.billing_id}.pdf`;
        const outPath = args.save_path || path.join(os.homedir(), 'Desktop', defaultName);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, Buffer.from(result.pdf_base64, 'base64'));

        return {
          content: [
            {
              type: 'text' as const,
              text: `請求書PDFを保存しました:\n保存先: ${outPath}\n請求番号: ${result.billing_number || '(不明)'}\npdf_url: ${result.pdf_url}`,
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

  mf_add_billing_item: {
    description: '既存の請求書に明細行を1行追加します（請求書更新APIは明細を扱えないため、明細の変更はこちらを使います）',
    inputSchema: z.object({
      billing_id: z.string().describe('請求書ID'),
      item_id: z.string().optional().describe('品目ID（マスタから選択する場合。指定時はマスタのnameで登録される）'),
      name: z.string().optional().describe('品目名'),
      detail: z.string().optional().describe('詳細・摘要'),
      unit: z.string().optional().describe('単位'),
      delivery_number: z.string().optional().describe('納品番号'),
      delivery_date: z.string().optional().describe('納品日（YYYY-MM-DD）'),
      price: z.number().describe('単価'),
      quantity: z.number().describe('数量'),
      is_deduct_withholding_tax: z.boolean().optional().describe('源泉徴収対象（個人事業主のみ）'),
      excise: z
        .enum(['untaxable', 'non_taxable', 'tax_exemption', 'five_percent', 'eight_percent', 'eight_percent_as_reduced_tax_rate', 'ten_percent'])
        .optional()
        .describe('消費税区分（item_id を指定しない場合は必須）'),
    }),
    handler: async (args: { billing_id: string } & AddBillingItemParams) => {
      try {
        const { billing_id, ...item } = args;
        if (!item.item_id && !item.excise) {
          throw new Error('item_id を指定しない場合、excise（消費税区分）は必須です。');
        }
        const created = await addBillingItem(billing_id, item);

        return {
          content: [
            {
              type: 'text' as const,
              text: `明細を追加しました\n\n明細ID: ${created.id || '-'}\n品目名: ${created.name || '-'}\n単価: ${yen((created.price ?? 0))} × ${created.quantity ?? 0}`,
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

  mf_delete_billing_item: {
    description: '請求書から明細行を1行削除します（明細IDは mf_get_billing で確認）',
    inputSchema: z.object({
      billing_id: z.string().describe('請求書ID'),
      item_id: z.string().describe('削除する明細行のID'),
    }),
    handler: async (args: { billing_id: string; item_id: string }) => {
      try {
        await deleteBillingItem(args.billing_id, args.item_id);

        return {
          content: [
            {
              type: 'text' as const,
              text: `明細を削除しました（請求書ID: ${args.billing_id} / 明細ID: ${args.item_id}）`,
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
