import { FinanceApi } from '../shared/types';

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    financeApi: FinanceApi;
  }
}

export {};
