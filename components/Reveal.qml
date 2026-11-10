import QtQuick
import qs.Commons

// Content that arrives and leaves in place: it fades while easing up from just
// under full size, and leaves faster than it came. Hidden content takes no
// input and is not drawn.
Item {
  id: root

  property bool shown: false
  property real restScale: 0.96
  readonly property int enterMs: 180
  readonly property int exitMs: 110

  opacity: shown ? 1 : 0
  scale: shown ? 1 : restScale
  visible: opacity > 0.001
  enabled: shown

  Behavior on opacity {
    NumberAnimation {
      duration: Style.duration(root.shown ? root.enterMs : root.exitMs)
      easing.type: Easing.OutCubic
    }
  }

  Behavior on scale {
    NumberAnimation {
      duration: Style.duration(root.shown ? root.enterMs : root.exitMs)
      easing.type: Easing.Bezier
      easing.bezierCurve: Style.easeOut
    }
  }
}
