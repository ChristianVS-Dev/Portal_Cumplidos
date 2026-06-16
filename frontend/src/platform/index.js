export {
  isNativeApp,
  getPlatform,
  getApiBaseUrl,
  getAppMeta,
} from './config.js';

export { getDeviceOnline, subscribeNetworkStatus } from './network.js';

export { initNativeShell, bindAndroidBackButton, bindAppState } from './lifecycle.js';
