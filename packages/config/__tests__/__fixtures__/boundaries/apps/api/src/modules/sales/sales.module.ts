import { allowedUseCase } from './application/allowed-use-case';
import { salesTable } from './infrastructure/schema';

export const salesModule = { allowedUseCase, salesTable };
