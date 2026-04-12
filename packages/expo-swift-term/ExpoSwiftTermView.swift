import ExpoModulesCore
import UIKit

/// Interactive terminal — dark keyboard, no autocorrect.
private final class InteractiveTerminalView: TerminalView {
  override var keyboardAppearance: UIKeyboardAppearance {
    get { .dark }
    set { /* fixed */ }
  }
  override var autocorrectionType: UITextAutocorrectionType {
    get { .no }
    set { /* fixed */ }
  }
  override var autocapitalizationType: UITextAutocapitalizationType {
    get { .none }
    set { /* fixed */ }
  }
  override var spellCheckingType: UITextSpellCheckingType {
    get { .no }
    set { /* fixed */ }
  }
  override var smartDashesType: UITextSmartDashesType {
    get { .no }
    set { /* fixed */ }
  }
  override var smartQuotesType: UITextSmartQuotesType {
    get { .no }
    set { /* fixed */ }
  }
  override var smartInsertDeleteType: UITextSmartInsertDeleteType {
    get { .no }
    set { /* fixed */ }
  }
}

/// Display-only terminal — refuses first responder so the React composer
/// can own keyboard input without SwiftTerm re-claiming focus on any tap.
private final class DisplayOnlyTerminalView: TerminalView {
  override var canBecomeFirstResponder: Bool { false }
  override var canBecomeFocused: Bool { false }
  override func becomeFirstResponder() -> Bool { false }
  override var inputAccessoryView: UIView? {
    get { nil }
    set { /* ignore — display-only */ }
  }
}

class ExpoSwiftTermView: ExpoView, TerminalViewDelegate {
  private var terminalView: TerminalView!
  private var currentFontSize: CGFloat = 14
  private var currentFontFamily: String = "Menlo"
  private var lastFeedSeq: Int = -1
  private var interactive: Bool = true

  let onData = EventDispatcher()
  let onResize = EventDispatcher()
  let onTitleChange = EventDispatcher()
  let onBell = EventDispatcher()
  let onFocusChange = EventDispatcher()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    setupTerminal()
  }

  private func setupTerminal() {
    let font = UIFont(name: currentFontFamily, size: currentFontSize)
      ?? UIFont.monospacedSystemFont(ofSize: currentFontSize, weight: .regular)

    terminalView = interactive
      ? InteractiveTerminalView(frame: .zero, font: font)
      : DisplayOnlyTerminalView(frame: .zero, font: font)
    terminalView.terminalDelegate = self
    terminalView.translatesAutoresizingMaskIntoConstraints = false

    if !interactive {
      terminalView.isUserInteractionEnabled = false
    }

    addSubview(terminalView)

    NSLayoutConstraint.activate([
      terminalView.topAnchor.constraint(equalTo: topAnchor),
      terminalView.leadingAnchor.constraint(equalTo: leadingAnchor),
      terminalView.trailingAnchor.constraint(equalTo: trailingAnchor),
      terminalView.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  func updateInteractive(_ value: Bool) {
    guard value != interactive else { return }
    interactive = value
    terminalView.removeFromSuperview()
    setupTerminal()
  }

  // MARK: - Focus

  func focus() {
    terminalView.becomeFirstResponder()
  }

  func blur() {
    terminalView.resignFirstResponder()
  }

  // MARK: - Layout

  private var lastEmittedCols: Int = 0
  private var lastEmittedRows: Int = 0

  override func layoutSubviews() {
    super.layoutSubviews()
    if bounds.width > 0 && bounds.height > 0 {
      terminalView.setNeedsLayout()
      terminalView.layoutIfNeeded()

      let terminal = terminalView.getTerminal()
      let cols = terminal.cols
      let rows = terminal.rows
      if cols > 0 && rows > 0 && (cols != lastEmittedCols || rows != lastEmittedRows) {
        lastEmittedCols = cols
        lastEmittedRows = rows
        onResize(["cols": cols, "rows": rows])
      }
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
    guard let data = packet.data(using: .utf8) else { return }
    guard let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return
    }
    guard let chunks = parsed["chunks"] as? [[String: Any]] else { return }
    for chunk in chunks {
      guard let seq = chunk["s"] as? Int, seq > lastFeedSeq else { continue }
      guard let kind = chunk["k"] as? String, let value = chunk["d"] as? String else {
        continue
      }
      lastFeedSeq = seq
      if kind == "b" {
        if let bytes = Data(base64Encoded: value) {
          terminalView.feed(byteArray: ArraySlice(bytes))
        }
      } else if kind == "t" {
        terminalView.feed(text: value)
      }
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
