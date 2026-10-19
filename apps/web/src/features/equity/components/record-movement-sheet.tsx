import { zodResolver } from '@hookform/resolvers/zod';
import { Period } from '@mini-market/shared-kernel';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/lib/api/api-error-message';
import { Button } from '@/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/ui/form';
import { Input } from '@/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/ui/sheet';
import { useRecordCapitalMovement } from '../api/capital';
import {
  recordMovementFormSchema,
  toRecordRequest,
  type RecordMovementFormValues,
} from '../schemas';

const KINDS = ['contribution', 'withdrawal'] as const;

interface RecordMovementSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** IANA zone of the business: the default date is today there. */
  readonly timeZone: string;
  /** `warning` is true when the withdrawal left the net capital below zero. */
  readonly onRecorded: (warning: boolean) => void;
}

export function RecordMovementSheet(props: RecordMovementSheetProps) {
  const { t } = useTranslation('equity');
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{t('record.title')}</SheetTitle>
          <SheetDescription>{t('record.description')}</SheetDescription>
        </SheetHeader>
        <RecordMovementForm {...props} />
      </SheetContent>
    </Sheet>
  );
}

function RecordMovementForm({ timeZone, onOpenChange, onRecorded }: RecordMovementSheetProps) {
  const { t, i18n } = useTranslation('equity');
  const record = useRecordCapitalMovement();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<RecordMovementFormValues>({
    resolver: zodResolver(recordMovementFormSchema),
    defaultValues: {
      kind: 'contribution',
      amount: '',
      occurredOn: Period.dayKey(new Date(), timeZone),
      note: '',
    },
  });

  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      const recorded = await record.mutateAsync(toRecordRequest(values));
      onRecorded(recorded.warning);
      onOpenChange(false);
    } catch (error) {
      setFailure(apiErrorMessage(i18n, error));
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormItem>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">{t('record.kind')}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {KINDS.map((kind) => (
                    <label
                      key={kind}
                      className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={field.name}
                        value={kind}
                        checked={field.value === kind}
                        onChange={() => field.onChange(kind)}
                      />
                      {t(`kind.${kind}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('record.amount')}</FormLabel>
              <FormControl>
                <Input inputMode="decimal" autoComplete="off" {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t('record.amountHint')}</p>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="occurredOn"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('record.date')}</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('record.note')}</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {failure ? (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        ) : null}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('record.saving') : t('record.submit')}
        </Button>
      </form>
    </Form>
  );
}
