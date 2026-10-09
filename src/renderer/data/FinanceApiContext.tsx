import { createContext, useContext } from 'react';
import { FinanceApi } from '../../shared/types';

const FinanceApiContext = createContext<FinanceApi | undefined>(undefined);

export const FinanceApiProvider = FinanceApiContext.Provider;

export function useFinanceApi(): FinanceApi {
  const api = useContext(FinanceApiContext);
  if (!api) throw new Error('useFinanceApi must be used inside App.');
  return api;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
