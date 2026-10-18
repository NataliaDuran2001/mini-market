import { useTranslation } from 'react-i18next';
import { Toaster as Sonner, toast, type ToasterProps } from 'sonner';

// shadcn/ui "toast" is sonner. Mount <Toaster /> once in the app providers; call toast.* anywhere.
// sonner ships English accessibility labels, so both are overridden with Spanish i18n text.
function Toaster(props: ToasterProps) {
  const { t } = useTranslation('common');
  return (
    <Sonner
      position="top-center"
      richColors
      closeButton
      customAriaLabel={t('toast.region')}
      toastOptions={{ closeButtonAriaLabel: t('actions.close') }}
      {...props}
    />
  );
}

export { Toaster, toast };
