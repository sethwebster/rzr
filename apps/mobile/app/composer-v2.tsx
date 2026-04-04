import { SafeAreaView } from '@/tw';
import { ComposerV2 } from '@/components/composer-v2';

export default function ComposerV2Screen() {
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-transparent">
      <ComposerV2 />
    </SafeAreaView>
  );
}
