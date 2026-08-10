// 共通型 re-export
export type { OAuthTokens, OAuthConfig, Pagination, ListResponse, ApiError } from './common.js';

// 経費API型 re-export
export type {
  Office,
  ExTransaction,
  ExReport,
  ExReportApproval,
  ExItem,
  Excise,
  Dept,
  Project,
  UploadReceiptResponse,
  CreateExTransactionParams,
  UpdateExTransactionParams,
} from './expense.js';

// 取引先
export interface Partner {
  id: string;
  name: string;
  name_kana?: string;
  name_suffix?: string;
  code?: string;
  memo?: string;
  departments: PartnerDepartment[];
  created_at: string;
  updated_at: string;
}

export interface PartnerDepartment {
  id: string;
  name: string;
  zip?: string;
  tel?: string;
  prefecture?: string;
  address1?: string;
  address2?: string;
  person_name?: string;
  person_title?: string;
  email?: string;
  cc_emails?: string;
}

// 品目
export interface Item {
  id: string;
  name: string;
  code?: string;
  detail?: string;
  unit?: string;
  price?: number;
  quantity?: number;
  is_deduct_withholding_tax?: boolean;
  excise?: string;
  created_at: string;
  updated_at: string;
}

// 明細行
export interface LineItem {
  id?: string;
  name: string;
  code?: string;
  detail?: string;
  unit?: string;
  price: number;
  quantity: number;
  is_deduct_withholding_tax?: boolean;
  excise?: string;
}

// 見積書
export interface Quote {
  id: string;
  pdf_url?: string;
  operator_id?: string;
  department_id?: string;
  partner_id?: string;
  partner_name?: string;
  partner_detail?: string;
  member_id?: string;
  member_name?: string;
  title?: string;
  memo?: string;
  quote_number?: string;
  quote_date?: string;
  expired_date?: string;
  status: QuoteStatus;
  subtotal?: number;
  total_price?: number;
  tax?: number;
  items: QuoteItem[];
  created_at: string;
  updated_at: string;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'cancelled';

export interface QuoteItem {
  id?: string;
  name: string;
  code?: string;
  detail?: string;
  unit?: string;
  price: number;
  quantity: number;
  is_deduct_withholding_tax?: boolean;
  excise?: string;
}

export interface CreateQuoteParams {
  department_id: string;
  quote_date: string;
  expired_date: string;
  title?: string;
  memo?: string;
  note?: string;
  tag_names?: string[];
  document_name?: string;
  items?: InvoiceTemplateLineItem[];
}

export interface UpdateQuoteParams {
  title?: string;
  memo?: string;
  quote_date?: string;
  expired_date?: string;
  items?: InvoiceTemplateLineItem[];
}

// 納品書
export interface DeliverySlip {
  id: string;
  pdf_url?: string;
  operator_id?: string;
  department_id?: string;
  partner_id?: string;
  partner_name?: string;
  partner_detail?: string;
  title?: string;
  memo?: string;
  delivery_number?: string;
  delivery_date?: string;
  subtotal?: number;
  total_price?: number;
  tax?: number;
  items: DeliverySlipItem[];
  created_at: string;
  updated_at: string;
}

export interface DeliverySlipItem {
  id?: string;
  name: string;
  code?: string;
  detail?: string;
  unit?: string;
  price: number;
  quantity: number;
  is_deduct_withholding_tax?: boolean;
  excise?: string;
}

export interface CreateDeliverySlipFromQuoteParams {
  quote_id: string;
  delivery_date?: string;
  title?: string;
  memo?: string;
}

// 請求書
export interface Billing {
  id: string;
  pdf_url?: string;
  operator_id?: string;
  department_id?: string;
  partner_id?: string;
  partner_name?: string;
  partner_detail?: string;
  member_id?: string;
  member_name?: string;
  title?: string;
  memo?: string;
  payment_condition?: string;
  billing_number?: string;
  billing_date?: string;
  due_date?: string;
  sales_date?: string;
  payment_status: PaymentStatus;
  subtotal?: number;
  total_price?: number;
  tax?: number;
  items: BillingItem[];
  created_at: string;
  updated_at: string;
}

// MF v3 の payment_status は "0"=未設定 / "1"=未入金 / "2"=入金済み。
// APIとの変換は api/invoice/billings.ts で行い、ツール層は意味のある名前で扱う。
export type PaymentStatus = 'unset' | 'unsettled' | 'settled';

export interface BillingItem {
  id?: string;
  name: string;
  code?: string;
  detail?: string;
  unit?: string;
  price: number;
  quantity: number;
  is_deduct_withholding_tax?: boolean;
  excise?: string;
}

export interface CreateBillingParams {
  department_id?: string;
  partner_id?: string;
  partner_name?: string;
  partner_detail?: string;
  title?: string;
  memo?: string;
  payment_condition?: string;
  billing_date?: string;
  due_date?: string;
  sales_date?: string;
  items: LineItem[];
}

export interface CreateBillingFromQuoteParams {
  quote_id: string;
  billing_date?: string;
  due_date?: string;
  sales_date?: string;
  title?: string;
  memo?: string;
  payment_condition?: string;
}

export interface UpdateBillingParams {
  department_id?: string;
  partner_id?: string;
  partner_name?: string;
  partner_detail?: string;
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
}

export interface UpdatePaymentStatusParams {
  billing_id: string;
  payment_status: PaymentStatus;
}

// MF v3 BillingItemAttachRequest 準拠。item_id 未指定時は excise が必須。
export interface AddBillingItemParams {
  item_id?: string;
  name?: string;
  delivery_number?: string;
  delivery_date?: string;
  detail?: string;
  unit?: string;
  price: number;
  quantity: number;
  is_deduct_withholding_tax?: boolean;
  excise?: string;
}

// インボイス制度対応請求書の明細行
export interface InvoiceTemplateLineItem {
  item_id?: string;
  name?: string;
  delivery_number?: string;
  delivery_date?: string;
  detail?: string;
  unit?: string;
  price: number;
  quantity: number;
  is_deduct_withholding_tax?: boolean;
  excise: 'untaxable' | 'non_taxable' | 'tax_exemption' | 'five_percent' | 'eight_percent' | 'eight_percent_as_reduced_tax_rate' | 'ten_percent';
}

// インボイス制度対応請求書作成パラメータ
export interface CreateInvoiceTemplateBillingParams {
  department_id: string;
  billing_date: string;
  title?: string;
  memo?: string;
  payment_condition?: string;
  due_date?: string;
  sales_date?: string;
  billing_number?: string;
  note?: string;
  document_name?: string;
  tag_names?: string[];
  items?: InvoiceTemplateLineItem[];
}


// 検索パラメータ
export interface ListPartnersParams {
  page?: number;
  per_page?: number;
  q?: string;
}

export interface ListItemsParams {
  page?: number;
  per_page?: number;
  q?: string;
}

export interface ListQuotesParams {
  page?: number;
  per_page?: number;
  partner_id?: string;
  status?: QuoteStatus;
  from?: string;
  to?: string;
  q?: string;
}

export interface ListBillingsParams {
  page?: number;
  per_page?: number;
  partner_id?: string;
  payment_status?: PaymentStatus;
  from?: string;
  to?: string;
  q?: string;
}

