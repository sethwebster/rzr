import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { requireNativeView } from "expo";
import type {
  ExpoSwiftTermNativeProps,
  ExpoSwiftTermViewProps,
  ExpoSwiftTermRef,
} from "./ExpoSwiftTerm.types";

const NativeView: ComponentType<ExpoSwiftTermNativeProps & { ref?: any }> =
  requireNativeView("ExpoSwiftTerm");

export const SwiftTermView = forwardRef<ExpoSwiftTermRef, ExpoSwiftTermViewProps>(
  function SwiftTermView(props, ref) {
    const seqRef = useRef(0);
    const [feedPacket, setFeedPacket] = useState<string | undefined>(undefined);

    useImperativeHandle(ref, () => ({
      write(data: string) {
        const seq = ++seqRef.current;
        setFeedPacket(`${seq}:b:${data}`);
      },
      writeText(text: string) {
        const seq = ++seqRef.current;
        setFeedPacket(`${seq}:t:${text}`);
      },
    }));

    return <NativeView {...props} feedPacket={feedPacket} />;
  }
);
