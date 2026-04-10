import type { ViewProps } from "react-native";

export interface ExpoSwiftTermNativeProps extends ViewProps {
  fontSize?: number;
  fontFamily?: string;
  foregroundColor?: string;
  backgroundColor?: string;
  /** Internal: sequence-tagged data packet for feeding the terminal */
  feedPacket?: string;
  /** Internal: sequence-tagged scroll packet "<seq>:<cumulativeDeltaY>". */
  scrollPacket?: string;
  onData?: (event: { nativeEvent: { data: string } }) => void;
  onResize?: (event: { nativeEvent: { cols: number; rows: number } }) => void;
  onTitleChange?: (event: { nativeEvent: { title: string } }) => void;
  onBell?: () => void;
}

export interface ExpoSwiftTermViewProps extends ViewProps {
  /** Font size in points (default: 14) */
  fontSize?: number;
  /** Font family name (default: "Menlo") */
  fontFamily?: string;
  /** Foreground text color as hex string (default: "#FFFFFF") */
  foregroundColor?: string;
  /** Background color as hex string (default: "#000000") */
  backgroundColor?: string;
  /** Called when user types — payload is base64-encoded bytes */
  onData?: (event: { nativeEvent: { data: string } }) => void;
  /** Called when terminal dimensions change */
  onResize?: (event: { nativeEvent: { cols: number; rows: number } }) => void;
  /** Called when terminal title changes (via escape sequence) */
  onTitleChange?: (event: { nativeEvent: { title: string } }) => void;
  /** Called when terminal bell fires */
  onBell?: () => void;
}

export interface ExpoSwiftTermRef {
  /** Write base64-encoded bytes to the terminal */
  write(data: string): void;
  /** Write a UTF-8 string to the terminal */
  writeText(text: string): void;
  /** Scroll the viewport by `delta` points (negative = toward older content). */
  scrollBy(delta: number): void;
}
