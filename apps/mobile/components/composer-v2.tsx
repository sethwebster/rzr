import { View } from '@/tw';

type ComposerV2Props = {
  sessionUrl?: string;
  token?: string;
  auth?: string;
  onReload?: () => void;
  onClear?: () => void;
  onForget?: () => void;
};

export function ComposerV2(_props: ComposerV2Props) {
  return <View className="flex-1 bg-transparent" />;
}
