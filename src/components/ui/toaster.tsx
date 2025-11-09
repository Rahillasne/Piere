import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-slate-900 group-[.toaster]:text-white group-[.toaster]:border-slate-800 group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-slate-400',
          actionButton:
            'group-[.toast]:bg-pierre-blue group-[.toast]:text-white',
          cancelButton:
            'group-[.toast]:bg-slate-800 group-[.toast]:text-slate-300',
          error: 'group-[.toast]:bg-red-900 group-[.toast]:border-red-700',
          success: 'group-[.toast]:bg-green-900 group-[.toast]:border-green-700',
        },
      }}
      {...props}
    />
  );
}
