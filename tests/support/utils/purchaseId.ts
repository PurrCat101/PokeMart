import { randomUUID } from 'node:crypto';

export const newPurchaseId = (): string => randomUUID();
