import * as path from 'node:path';
import * as os from 'node:os';

export interface ServiceConfig {
  name: string;
  oauth: {
    clientId: string;
    clientSecret: string;
    authorizeUrl: string;
    tokenUrl: string;
    scopes: string;
  };
  api: {
    baseUrl: string;
  };
  storage: {
    tokensFile: string;
  };
}

export type ServiceName = 'invoice' | 'expense';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'mf-mcp');

// Legacy path for migration
export const LEGACY_TOKENS_FILE = path.join(os.homedir(), '.config', 'mf-invoice-mcp', 'tokens.json');

export function getServiceConfig(service: ServiceName): ServiceConfig {
  switch (service) {
    case 'invoice':
      return {
        name: 'invoice',
        oauth: {
          clientId: process.env.MF_INVOICE_CLIENT_ID || process.env.MF_CLIENT_ID || '',
          clientSecret: process.env.MF_INVOICE_CLIENT_SECRET || process.env.MF_CLIENT_SECRET || '',
          authorizeUrl: 'https://api.biz.moneyforward.com/authorize',
          tokenUrl: 'https://api.biz.moneyforward.com/token',
          scopes: 'mfc/invoice/data.read mfc/invoice/data.write',
        },
        api: {
          baseUrl: 'https://invoice.moneyforward.com/api/v3',
        },
        storage: {
          tokensFile: path.join(CONFIG_DIR, 'invoice-tokens.json'),
        },
      };
    case 'expense':
      return {
        name: 'expense',
        oauth: {
          clientId: process.env.MF_EXPENSE_CLIENT_ID || '',
          clientSecret: process.env.MF_EXPENSE_CLIENT_SECRET || '',
          authorizeUrl: 'https://expense.moneyforward.com/oauth/authorize',
          tokenUrl: 'https://expense.moneyforward.com/oauth/token',
          scopes: 'office_setting:write user_setting:write transaction:write report:write account:write public_resource:read',
        },
        api: {
          baseUrl: 'https://expense.moneyforward.com/api/external/v1',
        },
        storage: {
          tokensFile: path.join(CONFIG_DIR, 'expense-tokens.json'),
        },
      };
  }
}
