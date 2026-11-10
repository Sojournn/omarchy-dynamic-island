import QtQuick
import qs.Commons
import "../IslandModel.js" as Model
import "../components"

// A timer beside the notch: a ring that empties on its left, the time left on
// its right. A finished timer swaps the ring for a check that beats until it
// is dismissed.
Reveal {
  id: root

  required property var island
  readonly property var timer: island.timer
  readonly property bool done: timer.status === "done"
  readonly property bool paused: timer.status === "paused"

  readonly property real wing: Math.ceil(Math.max(12 + 16 + 10, 10 + clock.implicitWidth + 12))

  ProgressRing {
    anchors.left: parent.left
    anchors.leftMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    visible: !root.done
    fraction: root.timer.fraction
    color: root.paused ? root.island.inkSecondary : root.island.accent
  }

  IslandText {
    id: check
    anchors.left: parent.left
    anchors.leftMargin: 12
    width: 16
    anchors.verticalCenter: parent.verticalCenter
    horizontalAlignment: Text.AlignHCenter
    visible: root.done
    text: Model.glyphs.check
    font.pixelSize: Style.font.title
    color: root.island.accent
    elide: Text.ElideNone

    SequentialAnimation on opacity {
      running: root.done && root.visible && !Style.reduceMotion
      loops: Animation.Infinite
      alwaysRunToEnd: true
      NumberAnimation { to: 0.35; duration: 520; easing.type: Easing.OutCubic }
      NumberAnimation { to: 1; duration: 520; easing.type: Easing.OutCubic }
    }
  }

  IslandText {
    id: clock
    anchors.right: parent.right
    anchors.rightMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    text: Model.formatClock(root.timer.remainingMs, true)
    font.pixelSize: Style.font.body
    font.bold: true
    color: root.paused ? root.island.inkSecondary : root.island.accent
    elide: Text.ElideNone
  }
}
