export interface PresetImageIcon {
  path: string;
  label: string;
}

/** Image icons bundled with the app and available independently of user data. */
export const PRESET_IMAGE_ICONS: readonly PresetImageIcon[] = [
  { path: '/logos/favicon.ico', label: 'بانک ملت' },
  { path: '/logos/bank-melli.webp', label: 'بانک ملی' },
  { path: '/logos/bank-maskan.webp', label: 'بانک مسکن' },
  { path: '/logos/bank-mehr-iran.webp', label: 'بانک مهر ایران' },
  { path: '/logos/logoScroll.png', label: 'بانک رسالت' },
  { path: '/logos/blue.jfif', label: 'بلو بانک' },
  { path: '/logos/Digipay-fa.svg', label: 'دیجی‌پی' },
  { path: '/logos/Logo-Tara-2th-1.svg', label: 'تارا' },
  { path: '/logos/snappTextLogo.svg', label: 'اسنپ' },
];
