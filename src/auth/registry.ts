import { OAuthManager } from './oauth.js';
import { getServiceConfig, type ServiceName } from '../config.js';

const managers = new Map<ServiceName, OAuthManager>();

export function getOAuthManager(service: ServiceName): OAuthManager {
  let manager = managers.get(service);
  if (!manager) {
    const config = getServiceConfig(service);
    if (!config.oauth.clientId || !config.oauth.clientSecret) {
      const envPrefix = service === 'invoice'
        ? 'MF_INVOICE_CLIENT_ID / MF_INVOICE_CLIENT_SECRET (or MF_CLIENT_ID / MF_CLIENT_SECRET)'
        : 'MF_EXPENSE_CLIENT_ID / MF_EXPENSE_CLIENT_SECRET';
      throw new Error(`${envPrefix} environment variables are required for ${service} service`);
    }
    manager = new OAuthManager(config);
    managers.set(service, manager);
  }
  return manager;
}
