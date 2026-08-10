import { getInvoiceClient } from '../client.js';
import type {
  Quote,
  Billing,
  ListQuotesParams,
  ListResponse,
  CreateQuoteParams,
  UpdateQuoteParams,
} from '../../types/index.js';

export async function listQuotes(params?: ListQuotesParams): Promise<ListResponse<Quote>> {
  return getInvoiceClient().get<ListResponse<Quote>>('/quotes', {
    page: params?.page,
    per_page: params?.per_page,
    partner_id: params?.partner_id,
    status: params?.status,
    from: params?.from,
    to: params?.to,
    q: params?.q,
  });
}

export async function getQuote(quoteId: string): Promise<Quote> {
  return getInvoiceClient().get<Quote>(`/quotes/${quoteId}`);
}

export async function createQuote(params: CreateQuoteParams): Promise<Quote> {
  return getInvoiceClient().post<Quote>('/quotes', params);
}

export async function updateQuote(quoteId: string, params: UpdateQuoteParams): Promise<Quote> {
  return getInvoiceClient().patch<Quote>(`/quotes/${quoteId}`, params);
}

export async function downloadQuotePdf(
  quoteId: string
): Promise<{ pdf_url: string; pdf_base64: string; quote_number?: string }> {
  // MF v3 は /quotes/{id}/pdf を持たない。見積書オブジェクトの pdf_url を認証付きで取得する。
  const client = getInvoiceClient();
  const quote = await client.get<Quote>(`/quotes/${quoteId}`);
  if (!quote.pdf_url) {
    throw new Error('この見積書には pdf_url がありません（MF側でPDF未生成の可能性）');
  }
  const buf = await client.getBinary(quote.pdf_url, 'application/pdf');
  return {
    pdf_url: quote.pdf_url,
    pdf_base64: buf.toString('base64'),
    quote_number: quote.quote_number,
  };
}

// 見積書を請求書に変換
export async function convertQuoteToBilling(quoteId: string): Promise<Billing> {
  return getInvoiceClient().post<Billing>(`/quotes/${quoteId}/convert_to_billing`, {});
}
