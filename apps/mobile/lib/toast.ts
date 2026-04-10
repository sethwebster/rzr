import { toast as sonnerToast } from 'sonner-native';

import { TOASTER_CONFIG } from './toast-config';

type SonnerToast = typeof sonnerToast;
type ToastOptions = Parameters<SonnerToast>[1];

function withDefaults(options?: ToastOptions): ToastOptions {
  return {
    duration: TOASTER_CONFIG.duration,
    position: TOASTER_CONFIG.position,
    ...options,
  };
}

export const toast = Object.assign(
  (message: string, options?: ToastOptions) => sonnerToast(message, withDefaults(options)),
  {
    success: (message: string, options?: ToastOptions) =>
      sonnerToast.success(message, withDefaults(options)),
    info: (message: string, options?: ToastOptions) =>
      sonnerToast.info(message, withDefaults(options)),
    error: (message: string, options?: ToastOptions) =>
      sonnerToast.error(message, withDefaults(options)),
    warning: (message: string, options?: ToastOptions) =>
      sonnerToast.warning(message, withDefaults(options)),
    loading: (message: string, options?: ToastOptions) =>
      sonnerToast.loading(message, withDefaults(options)),
    dismiss: sonnerToast.dismiss,
    promise: sonnerToast.promise,
    custom: sonnerToast.custom,
    wiggle: sonnerToast.wiggle,
  }
);
