import ExpoModulesCore
import UIKit

/// Display-only terminal view — refuses first responder so the React composer
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
  private var lastAppliedScrollSeq: Int = -1
  private var lastAppliedScrollTotal: CGFloat = 0

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

    terminalView = DisplayOnlyTerminalView(frame: .zero, font: font)
    terminalView.terminalDelegate = self
    terminalView.translatesAutoresizingMaskIntoConstraints = false
    // Disable touch dispatch on the terminal view so taps fall through to the
    // React composer sibling. Scrolling is driven programmatically by setting
    // `contentOffset.y` via the `contentOffsetY` prop — which works regardless
    // of `isUserInteractionEnabled` because it's a direct property assignment,
    // not a touch-triggered gesture. SwiftTerm's iOS draw path reads
    // `contentOffset.y / cellHeight` to compute the first visible row, so
    // this is what actually moves the viewport on screen.
    terminalView.isUserInteractionEnabled = false
    addSubview(terminalView)

    NSLayoutConstraint.activate([
      terminalView.topAnchor.constraint(equalTo: topAnchor),
      terminalView.leadingAnchor.constraint(equalTo: leadingAnchor),
      terminalView.trailingAnchor.constraint(equalTo: trailingAnchor),
      terminalView.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  private var lastEmittedCols: Int = 0
  private var lastEmittedRows: Int = 0

  override func layoutSubviews() {
    super.layoutSubviews()
    // Force SwiftTerm to recalculate its grid dimensions after layout.
    if bounds.width > 0 && bounds.height > 0 {
      terminalView.setNeedsLayout()
      terminalView.layoutIfNeeded()

      // SwiftTerm's own `sizeChanged` delegate only fires when dimensions
      // actually change — if the default terminal grid happens to match the
      // first computed grid, the delegate is silent and our JS side never
      // learns the real cols/rows. Emit from here so the WS client always
      // sees the current grid size as soon as the view has bounds.
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

  // MARK: - Scroll control

  /// Handles a JS-side scroll packet formatted as "<seq>:<totalPoints>".
  /// `totalPoints` is the cumulative total scroll delta the JS PanResponder
  /// has tracked since mount; we diff against our own last-applied total to
  /// compute the incremental delta that actually needs to be applied to
  /// `terminalView.contentOffset.y`. A negative delta scrolls UP through the
  /// scrollback (older content). Positive scrolls DOWN toward live output.
  ///
  /// Relative deltas sidestep the JS-vs-native contentOffset sync problem:
  /// JS never needs to know the absolute native position, and the delta is
  /// applied on top of whatever the scroll view is currently showing (which
  /// may include auto-follow-bottom updates from `updateScroller`).
  func handleScrollPacket(_ packet: String) {
    let parts = packet.split(separator: ":", maxSplits: 1).map(String.init)
    guard parts.count == 2, let seq = Int(parts[0]), let totalFloat = Double(parts[1]) else {
      return
    }
    guard seq > lastAppliedScrollSeq else { return }
    lastAppliedScrollSeq = seq
    let total = CGFloat(totalFloat)
    let delta = total - lastAppliedScrollTotal
    lastAppliedScrollTotal = total
    if delta == 0 { return }

    let maxY = max(0, terminalView.contentSize.height - terminalView.bounds.height)
    let newY = max(0, min(terminalView.contentOffset.y + delta, maxY))
    terminalView.contentOffset = CGPoint(x: 0, y: newY)
  }

  // MARK: - Feed packet prop

  func handleFeedPacket(_ packet: String) {
    // Packet format: { "chunks": [ { "s": Int, "k": "t"|"b", "d": String }, ... ] }
    // The JS side re-sends the full unflushed buffer on every flush to defeat
    // React auto-batching coalescing; we skip chunks we've already applied by
    // tracking `lastFeedSeq`.
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
