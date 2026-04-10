import type { ToasterProps } from 'sonner-native';

const BG = '#0b1123';
const BORDER = 'rgba(255,255,255,0.08)';
const TEXT = '#f8fbff';
const ACCENT = '#7cf6ff';
const MUTED = 'rgba(248,251,255,0.7)';

export const TOASTER_CONFIG = {
  theme: 'dark',
  position: 'bottom-center',
  duration: 3500,
  gap: 8,
  offset: 24,
  swipeToDismissDirection: 'left',
  closeButton: false,
  richColors: false,
  visibleToasts: 3,
  toastOptions: {
    style: {
      backgroundColor: BG,
      borderColor: BORDER,
      borderWidth: 1,
      borderRadius: 14,
    },
    titleStyle: {
      color: TEXT,
      fontSize: 14,
      fontWeight: '600',
    },
    descriptionStyle: {
      color: MUTED,
      fontSize: 13,
    },
    actionButtonStyle: {
      backgroundColor: ACCENT,
      borderRadius: 8,
    },
    actionButtonTextStyle: {
      color: '#050816',
      fontWeight: '600',
    },
    cancelButtonStyle: {
      backgroundColor: 'transparent',
      borderRadius: 8,
    },
    cancelButtonTextStyle: {
      color: MUTED,
    },
  },
} satisfies ToasterProps;
