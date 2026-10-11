import { ReactNode } from 'react';

/** A printable report the app mounts and then saves as a PDF. */
export type PrintJob = {
  fileName: string;
  landscape?: boolean;
  /** A standalone-print-report element. */
  content: ReactNode;
};
