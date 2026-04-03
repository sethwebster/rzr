import { ConnectStage } from '@/components/connect/connect-stage';
import { useConnectFlow } from '@/hooks/use-connect-flow';

export default function HomeScreen() {
  const { snapshot, actions } = useConnectFlow();

  return <ConnectStage snapshot={snapshot} actions={actions} />;
}
