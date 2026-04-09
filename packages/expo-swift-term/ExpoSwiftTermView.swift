import ExpoModulesCore
import UIKit

class ExpoSwiftTermView: ExpoView, TerminalViewDelegate {
  private var terminalView: TerminalView!
  private var currentFontSize: CGFloat = 14
  private var currentFontFamily: String = "Menlo"
  private var lastFeedSeq: Int = -1

  let onData = EventDispatcher()
  let onResize = EventDispatcher()
  let onTitleChange = EventDispatcher()
  let onBell = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    setupTerminal()
  }

  private func setupTerminal() {
    let font = UIFont(name: currentFontFamily, size: currentFontSize)
      ?? UIFont.monospacedSystemFont(ofSize: currentFontSize, weight: .regular)

    terminalView = TerminalView(frame: .zero, font: font)
    terminalView.terminalDelegate = self
    terminalView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(terminalView)

    NSLayoutConstraint.activate([
      terminalView.topAnchor.constraint(equalTo: topAnchor),
      terminalView.leadingAnchor.constraint(equalTo: leadingAnchor),
      terminalView.trailingAnchor.constraint(equalTo: trailingAnchor),
      terminalView.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // Force SwiftTerm to recalculate its grid dimensions after layout
    if bounds.width > 0 && bounds.height > 0 {
      terminalView.setNeedsLayout()
      terminalView.layoutIfNeeded()
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      terminalView.becomeFirstResponder()
    }
  }

  // MARK: - Props

  func updateFontSize(_ size: CGFloat) {
    currentFontSize = size
    applyFont()
  }

  func updateFontFamily(_ family: String) {
    currentFontFamily = family
    applyFont()
  }

  private func applyFont() {
    let font = UIFont(name: currentFontFamily, size: currentFontSize)
      ?? UIFont.monospacedSystemFont(ofSize: currentFontSize, weight: .regular)
    terminalView.font = font
  }

  func updateForegroundColor(_ hex: String) {
    if let color = UIColor(hex: hex) {
      terminalView.nativeForegroundColor = color
    }
  }

  func updateBackgroundColor(_ hex: String) {
    if let color = UIColor(hex: hex) {
      terminalView.nativeBackgroundColor = color
    }
  }

  // MARK: - Feed packet prop

  func handleFeedPacket(_ packet: String) {
    guard let colonIdx = packet.firstIndex(of: ":") else { return }
    let seqStr = String(packet[packet.startIndex..<colonIdx])
    guard let seq = Int(seqStr), seq > lastFeedSeq else { return }
    lastFeedSeq = seq

    let rest = String(packet[packet.index(after: colonIdx)...])
    if rest.hasPrefix("b:") {
      let b64 = String(rest.dropFirst(2))
      if let data = Data(base64Encoded: b64) {
        terminalView.feed(byteArray: ArraySlice(data))
      }
    } else if rest.hasPrefix("t:") {
      let text = String(rest.dropFirst(2))
      terminalView.feed(text: text)
    }
  }

  // MARK: - TerminalViewDelegate

  func send(source: TerminalView, data: ArraySlice<UInt8>) {
    let base64 = Data(data).base64EncodedString()
    onData(["data": base64])
  }

  func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
    onResize(["cols": newCols, "rows": newRows])
  }

  func setTerminalTitle(source: TerminalView, title: String) {
    onTitleChange(["title": title])
  }

  func scrolled(source: TerminalView, position: Double) {}

  func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}

  func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {
    if let url = URL(string: link) {
      DispatchQueue.main.async {
        UIApplication.shared.open(url)
      }
    }
  }

  func bell(source: TerminalView) {
    onBell()
  }

  func clipboardCopy(source: TerminalView, content: Data) {
    if let text = String(data: content, encoding: .utf8) {
      UIPasteboard.general.string = text
    }
  }

  func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
}

// MARK: - UIColor hex helper

private extension UIColor {
  convenience init?(hex: String) {
    var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let rgb = UInt64(h, radix: 16) else { return nil }
    self.init(
      red: CGFloat((rgb >> 16) & 0xFF) / 255,
      green: CGFloat((rgb >> 8) & 0xFF) / 255,
      blue: CGFloat(rgb & 0xFF) / 255,
      alpha: 1
    )
  }
}
