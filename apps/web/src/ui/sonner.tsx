import { Toaster as Sonner, toast, type ToasterProps } from 'sonner';

// shadcn/ui "toast" is sonner. Mount <Toaster /> once in the app providers; call toast.* anywhere.
function Toaster(props: ToasterProps) {
  return <Sonner position="top-center" richColors closeButton {...props} />;
}

export { Toaster, toast };
