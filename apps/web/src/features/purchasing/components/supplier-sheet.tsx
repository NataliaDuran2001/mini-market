import { zodResolver } from '@hookform/resolvers/zod';
import {
  createSupplierRequestSchema,
  type CreateSupplierRequest,
  type Supplier,
} from '@mini-market/contracts/purchasing';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { ApiError } from '@/lib/api/api-error';
import { Button } from '@/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/ui/form';
import { Input } from '@/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/ui/sheet';
import { toast } from '@/ui/sonner';
import { purchasingErrorMessage } from '../api/error-message';
import { useCreateSupplier, useUpdateSupplier } from '../api/use-supplier-mutations';

type SupplierFormInput = z.input<typeof createSupplierRequestSchema>;

const FIELDS = ['name', 'phone', 'email', 'taxId', 'notes'] as const;
const INPUT_PROPS = {
  name: { autoComplete: 'organization' },
  phone: { type: 'tel', inputMode: 'tel', autoComplete: 'off' },
  email: { type: 'email', inputMode: 'email', autoComplete: 'off' },
  taxId: { inputMode: 'numeric', autoComplete: 'off' },
  notes: { autoComplete: 'off' },
} as const;

interface SupplierFormProps {
  readonly supplier: Supplier | null;
  readonly onDone: () => void;
}

function SupplierForm({ supplier, onDone }: SupplierFormProps) {
  const { t, i18n } = useTranslation('purchasing');
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<SupplierFormInput, unknown, CreateSupplierRequest>({
    resolver: zodResolver(createSupplierRequestSchema),
    defaultValues: {
      name: supplier?.name ?? '',
      phone: supplier?.phone ?? '',
      email: supplier?.email ?? '',
      taxId: supplier?.taxId ?? '',
      notes: supplier?.notes ?? '',
    },
  });

  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      if (supplier) await update.mutateAsync({ id: supplier.id, body: values });
      else await create.mutateAsync(values);
      toast.success(t(supplier ? 'suppliers.toast.updated' : 'suppliers.toast.created'));
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SUPPLIER_NAME_TAKEN') {
        form.setError('name', { message: 'purchasing:errors.SUPPLIER_NAME_TAKEN' });
      } else {
        setFailure(purchasingErrorMessage(i18n, error));
      }
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
        {FIELDS.map((name) => (
          <FormField
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t(`suppliers.form.${name}`)}</FormLabel>
                <FormControl>
                  <Input {...INPUT_PROPS[name]} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        {failure ? (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        ) : null}
        <SheetFooter>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {t(form.formState.isSubmitting ? 'suppliers.form.saving' : 'suppliers.form.save')}
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('suppliers.form.cancel')}
          </Button>
        </SheetFooter>
      </form>
    </Form>
  );
}

interface SupplierSheetProps {
  readonly open: boolean;
  /** The supplier being edited, or null to create one. */
  readonly supplier: Supplier | null;
  readonly onOpenChange: (open: boolean) => void;
}

/** Create or edit sheet. The form mounts fresh on every open, so it never shows stale values. */
export function SupplierSheet({ open, supplier, onOpenChange }: SupplierSheetProps) {
  const { t } = useTranslation('purchasing');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {t(supplier ? 'suppliers.form.editTitle' : 'suppliers.form.createTitle')}
          </SheetTitle>
          <SheetDescription>{t('suppliers.form.description')}</SheetDescription>
        </SheetHeader>
        <SupplierForm
          key={supplier?.id ?? 'new'}
          supplier={supplier}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
