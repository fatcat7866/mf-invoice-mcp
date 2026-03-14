import { getInvoiceClient } from '../client.js';
import type {
  Billing,
  BillingItem,
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

export async function addBillingItem(billingId: string, item: AddBillingItemParams): Promise<BillingItem> {
  return getInvoiceClient().post<BillingItem>(`/billings/${billingId}/items`, { item });
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

export async function updateBilling(billingId: string, params: UpdateBillingParams): Promise<Billing> {
  return getInvoiceClient().patch<Billing>(`/billings/${billingId}`, { billing: params });
}

export async function updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<Billing> {
  return getInvoiceClient().patch<Billing>(`/billings/${params.billing_id}`, {
    billing: { payment_status: params.payment_status },
  });
}

export async function downloadBillingPdf(billingId: string): Promise<{ pdf_url: string }> {
  return getInvoiceClient().get<{ pdf_url: string }>(`/billings/${billingId}/pdf`);
}
