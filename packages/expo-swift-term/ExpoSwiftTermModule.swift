import ExpoModulesCore

public class ExpoSwiftTermModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoSwiftTerm")

    View(ExpoSwiftTermView.self) {
      Events("onData", "onResize", "onTitleChange", "onBell")

      Prop("fontSize") { (view: ExpoSwiftTermView, size: Double) in
        view.updateFontSize(CGFloat(size))
      }

      Prop("fontFamily") { (view: ExpoSwiftTermView, family: String) in
        view.updateFontFamily(family)
      }

      Prop("foregroundColor") { (view: ExpoSwiftTermView, hex: String) in
        view.updateForegroundColor(hex)
      }

      Prop("backgroundColor") { (view: ExpoSwiftTermView, hex: String) in
        view.updateBackgroundColor(hex)
      }

      Prop("feedPacket") { (view: ExpoSwiftTermView, packet: String) in
        view.handleFeedPacket(packet)
      }

      Prop("scrollPacket") { (view: ExpoSwiftTermView, packet: String) in
        view.handleScrollPacket(packet)
      }
    }
  }
}
