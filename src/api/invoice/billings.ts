import { getInvoiceClient } from '../client.js';
import type {
  Billing,
  BillingItem,
  PaymentStatus,
  ListBillingsParams,
  ListResponse,
  CreateBillingParams,
  CreateInvoiceTemplateBillingParams,
  CreateBillingFromQuoteParams,
  UpdateBillingParams,
  UpdatePaymentStatusParams,
  AddBillingItemParams,
} from '../../types/index.js';

export async function listBillings(params?: ListBillingsParams): Promise<ListResponse<Billing>> {
  return getInvoiceClient().get<ListResponse<Billing>>('/billings', {
    page: params?.page,
    per_page: params?.per_page,
    partner_id: params?.partner_id,
    payment_status: params?.payment_status,
    from: params?.from,
    to: params?.to,
    q: params?.q,
  });
}

export async function getBilling(billingId: string): Promise<Billing> {
  return getInvoiceClient().get<Billing>(`/billings/${billingId}`);
}

export async function createBilling(params: CreateBillingParams): Promise<Billing> {
  // v3 APIではitemsを含めずに請求書を作成
  const { items, ...billingParams } = params;
  return getInvoiceClient().post<Billing>('/billings', { billing: billingParams });
}

// MF v3 の BillingItemAttachRequest はフラットなボディ（{ item: ... } ラップではない）。
export async function addBillingItem(billingId: string, item: AddBillingItemParams): Promise<BillingItem> {
  return getInvoiceClient().post<BillingItem>(`/billings/${billingId}/items`, item);
}

export async function deleteBillingItem(billingId: string, itemId: string): Promise<void> {
  await getInvoiceClient().delete(`/billings/${billingId}/items/${itemId}`);
}

// インボイス制度対応の請求書作成
export async function createInvoiceTemplateBilling(params: CreateInvoiceTemplateBillingParams): Promise<Billing> {
  return getInvoiceClient().post<Billing>('/invoice_template_billings', params);
}

export async function createBillingFromQuote(params: CreateBillingFromQuoteParams): Promise<Billing> {
  return getInvoiceClient().post<Billing>('/billings/from_quote', {
    quote_id: params.quote_id,
    billing: {
      billing_date: params.billing_date,
      due_date: params.due_date,
      sales_date: params.sales_date,
      title: params.title,
      memo: params.memo,
      payment_condition: params.payment_condition,
    },
  });
}

// MF v3 は PUT /billings/{billing_id}。PATCH はルート未定義で404になる。
// ボディは BillingUpdateRequest（フラット）で、items は受け付けない
// （明細の増減は /billings/{id}/items 系エンドポイントを使う）。
export async function updateBilling(billingId: string, params: UpdateBillingParams): Promise<Billing> {
  const { items, ...rest } = params as UpdateBillingParams & { items?: unknown };
  if (items !== undefined) {
    throw new Error(
      '請求書の更新APIは明細（items）を受け付けません。明細の変更は mf_add_billing_item / mf_delete_billing_item を使ってください。'
    );
  }
  return getInvoiceClient().put<Billing>(`/billings/${billingId}`, rest);
}

// MF v3 は PUT /billings/{billing_id}/payment_status。値は "0"=未設定 / "1"=未入金 / "2"=入金済み。
const PAYMENT_STATUS_CODE: Record<PaymentStatus, string> = {
  unset: '0',
  unsettled: '1',
  settled: '2',
};

export async function updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<Billing> {
  return getInvoiceClient().put<Billing>(`/billings/${params.billing_id}/payment_status`, {
    payment_status: PAYMENT_STATUS_CODE[params.payment_status],
  });
}

export async function downloadBillingPdf(
  billingId: string
): Promise<{ pdf_url: string; pdf_base64: string; billing_number?: string }> {
  // MF v3 は /billings/{id}/pdf という個別PDFエンドポイントを持たない。
  // 請求書オブジェクトの pdf_url フィールドを読み、それを認証付きで取得する。
  const client = getInvoiceClient();
  const billing = await client.get<Billing>(`/billings/${billingId}`);
  if (!billing.pdf_url) {
    throw new Error('この請求書には pdf_url がありません（MF側でPDF未生成の可能性）');
  }
  const buf = await client.getBinary(billing.pdf_url, 'application/pdf');
  return {
    pdf_url: billing.pdf_url,
    pdf_base64: buf.toString('base64'),
    billing_number: billing.billing_number,
  };
}
