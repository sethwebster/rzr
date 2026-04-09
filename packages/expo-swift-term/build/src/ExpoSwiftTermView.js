"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwiftTermView = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const expo_1 = require("expo");
const NativeView = (0, expo_1.requireNativeView)("ExpoSwiftTerm");
exports.SwiftTermView = (0, react_1.forwardRef)(function SwiftTermView(props, ref) {
    const seqRef = (0, react_1.useRef)(0);
    const [feedPacket, setFeedPacket] = (0, react_1.useState)(undefined);
    (0, react_1.useImperativeHandle)(ref, () => ({
        write(data) {
            const seq = ++seqRef.current;
            setFeedPacket(`${seq}:b:${data}`);
        },
        writeText(text) {
            const seq = ++seqRef.current;
            setFeedPacket(`${seq}:t:${text}`);
        },
    }));
    return (0, jsx_runtime_1.jsx)(NativeView, { ...props, feedPacket: feedPacket });
});
//# sourceMappingURL=ExpoSwiftTermView.js.map