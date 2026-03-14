import { getExpenseClient } from '../client.js';
import type { ExReport, ExTransaction } from '../../types/index.js';

export async function listMyExReports(officeId: string, params?: {
  page?: number;
  limit?: number;
}): Promise<ExReport[]> {
  const result = await getExpenseClient().get<{ ex_reports?: ExReport[] }>(
    `/offices/${officeId}/me/ex_reports`,
    {
      page: params?.page,
      limit: params?.limit,
    }
  );
  return result.ex_reports || [];
}

export async function getExReport(officeId: string, reportId: string): Promise<ExReport> {
  return getExpenseClient().get<ExReport>(
    `/offices/${officeId}/me/ex_reports/${reportId}`
  );
}

export async function listReportTransactions(officeId: string, reportId: string, params?: {
  page?: number;
  limit?: number;
}): Promise<ExTransaction[]> {
  const result = await getExpenseClient().get<{ ex_transactions?: ExTransaction[] }>(
    `/offices/${officeId}/ex_reports/${reportId}/ex_transactions`,
    {
      page: params?.page,
      limit: params?.limit,
    }
  );
  return result.ex_transactions || [];
}

export async function approveExReport(officeId: string, reportId: string): Promise<ExReport> {
  return getExpenseClient().post<ExReport>(
    `/offices/${officeId}/me/approving_ex_reports/${reportId}/approve`,
    {}
  );
}

export async function disapproveExReport(officeId: string, reportId: string): Promise<ExReport> {
  return getExpenseClient().post<ExReport>(
    `/offices/${officeId}/me/approving_ex_reports/${reportId}/disapprove`,
    {}
  );
}
