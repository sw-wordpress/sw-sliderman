import { getConfig } from '@editor/config';
import { ApiClient, type Transport } from './client';
import { fontsApi } from './fonts';
import { slidersApi } from './sliders';

let client: ApiClient | null = null;

/** Lazily created so modules can be imported before the config is read (tests, error states). */
function api(): ApiClient {
  if (client === null) {
    const config = getConfig();
    client = new ApiClient({ restRoot: config.restRoot, nonce: config.nonce });
  }
  return client;
}

const transport: Transport = {
  get: (...args) => api().get(...args),
  post: (...args) => api().post(...args),
  put: (...args) => api().put(...args),
  delete: (...args) => api().delete(...args),
};

export const sliders = slidersApi(transport);
export const fonts = fontsApi(transport);
