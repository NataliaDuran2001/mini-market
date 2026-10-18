import type { Label as LabelPrimitive } from 'radix-ui';
import { Slot } from 'radix-ui';
import { createContext, useContext, useId, type ComponentProps, type ReactElement } from 'react';
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { translateKey } from '@/lib/i18n/translate-key';
import { cn } from '@/lib/utils';
import { Label } from './label';

// react-hook-form + Zod: build the form with the schema from @mini-market/contracts so that client
// validation equals server validation (docs/04-coding-standards.md section 7).
const Form = FormProvider;

interface FormFieldContextValue {
  readonly name: string;
}
const FormFieldContext = createContext<FormFieldContextValue | null>(null);
const FormItemContext = createContext<{ readonly id: string } | null>(null);

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>): ReactElement {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

function useFormField() {
  const field = useContext(FormFieldContext);
  const item = useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: field?.name ?? '' });
  if (!field || !item)
    throw new Error('useFormField must be used inside <FormField> and <FormItem>');
  const fieldState = getFieldState(field.name, formState);
  return {
    name: field.name,
    id: item.id,
    formItemId: `${item.id}-form-item`,
    formDescriptionId: `${item.id}-form-item-description`,
    formMessageId: `${item.id}-form-item-message`,
    ...fieldState,
  };
}

function FormItem({ className, ...props }: ComponentProps<'div'>) {
  const id = useId();
  return (
    <FormItemContext.Provider value={{ id }}>
      <div className={cn('grid gap-2', className)} {...props} />
    </FormItemContext.Provider>
  );
}

function FormLabel({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  const { error, formItemId } = useFormField();
  return (
    <Label className={cn(error && 'text-destructive', className)} htmlFor={formItemId} {...props} />
  );
}

function FormControl(props: ComponentProps<typeof Slot.Root>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return (
    <Slot.Root
      id={formItemId}
      aria-describedby={error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId}
      aria-invalid={Boolean(error)}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField();
  return (
    <p
      id={formDescriptionId}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

/**
 * Shows the field error. Schema messages are i18n keys (for example `common:errors.required`),
 * never hardcoded text; a message that is not a known key falls back to a generic Spanish one.
 */
function FormMessage({ className, children, ...props }: ComponentProps<'p'>) {
  const { error, formMessageId } = useFormField();
  const { t, i18n } = useTranslation('common');
  const key = error?.message;
  const body = key ? translateKey(i18n, key, t('errors.invalidField')) : children;
  if (!body) return null;
  return (
    <p
      id={formMessageId}
      role="alert"
      className={cn('text-sm text-destructive', className)}
      {...props}
    >
      {body}
    </p>
  );
}

export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
};
