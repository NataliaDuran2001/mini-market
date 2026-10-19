import {
  MAX_NOTE_LENGTH,
  capitalMovementKindSchema,
  recordCapitalMovementRequestSchema,
  type RecordCapitalMovementRequest,
} from '@mini-market/contracts/equity';
import { z } from 'zod';
import { parseAmountToCentavos } from './domain/amount';

/**
 * Form of the record sheet. The person types Bs; the API takes centavos, so the form has its own
 * shape and `toRecordRequest` maps it to the contract request (which is parsed again, so the form
 * can never send what the API would reject). Messages are i18n keys.
 */
export const recordMovementFormSchema = z
  .object({
    kind: capitalMovementKindSchema,
    amount: z.string().trim().min(1, 'equity:validation.amountRequired'),
    occurredOn: z.string().min(1, 'equity:validation.dateRequired'),
    note: z.string().max(MAX_NOTE_LENGTH, 'equity:validation.noteTooLong'),
  })
  .superRefine((values, context) => {
    const amount = parseAmountToCentavos(values.amount);
    if (!amount.ok && values.amount.trim() !== '') {
      context.addIssue({ code: 'custom', path: ['amount'], message: amount.error });
    }
  });

export type RecordMovementFormValues = z.infer<typeof recordMovementFormSchema>;

/** Only for values that passed `recordMovementFormSchema`. */
export function toRecordRequest(values: RecordMovementFormValues): RecordCapitalMovementRequest {
  const amount = parseAmountToCentavos(values.amount);
  return recordCapitalMovementRequestSchema.parse({
    kind: values.kind,
    amountCentavos: amount.ok ? amount.centavos : 0,
    occurredOn: values.occurredOn,
    ...(values.note.trim() === '' ? {} : { note: values.note }),
  });
}
