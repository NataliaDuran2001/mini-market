// Supplier contracts of the purchasing module (issue #27).
import { z } from 'zod';
import { uuidSchema } from '../common/index.js';

const NAME_MAX = 120;
const PHONE_MAX = 40;
const EMAIL_MAX = 254;
const TAX_ID_MAX = 40;
const NOTES_MAX = 1000;

const supplierName = z.string().trim().min(1).max(NAME_MAX);

/** Optional text field: blank means "none", so a form can send an empty input as it is. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX)
  .refine((value) => value === '' || z.email().safeParse(value).success, 'Invalid email address')
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

const detailFields = {
  phone: optionalText(PHONE_MAX),
  email: optionalEmail,
  taxId: optionalText(TAX_ID_MAX),
  notes: optionalText(NOTES_MAX),
};

export const supplierSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  taxId: z.string().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
});

/** `POST /api/v1/suppliers` (needs `suppliers.manage`). The name is unique per business, ignoring case. */
export const createSupplierRequestSchema = z
  .object({ name: supplierName, ...detailFields })
  .strict();

const DETAIL_KEYS = ['name', 'phone', 'email', 'taxId', 'notes'] as const;

/**
 * `PATCH /api/v1/suppliers/:id` (needs `suppliers.manage`): change the details, or switch the
 * supplier active or inactive. Exactly one of the two groups; a supplier is never deleted.
 */
export const updateSupplierRequestSchema = z
  .object({ name: supplierName.optional(), ...detailFields, active: z.boolean().optional() })
  .strict()
  .refine(
    (body) => DETAIL_KEYS.some((key) => body[key] !== undefined) !== (body.active !== undefined),
    { message: 'Send either the supplier details or active, not both' },
  );

/** `GET /api/v1/suppliers?q=&active=`: `q` matches name, phone, email and tax id. */
export const listSuppliersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const listSuppliersResponseSchema = z.object({ items: z.array(supplierSchema) });

export type Supplier = z.infer<typeof supplierSchema>;
export type CreateSupplierRequest = z.infer<typeof createSupplierRequestSchema>;
export type UpdateSupplierRequest = z.infer<typeof updateSupplierRequestSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type ListSuppliersResponse = z.infer<typeof listSuppliersResponseSchema>;
