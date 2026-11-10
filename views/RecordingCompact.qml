import QtQuick
import qs.Commons
import "../IslandModel.js" as Model
import "../components"

// A screen recording beside the notch: a beating red dot on its left, how
// long it has run on its right. While the video is being saved the dot gives
// way to a spinner.
Reveal {
  id: root

  required property var island
  readonly property var recording: island.recording
  readonly property bool busy: recording.busy

  readonly property real wing: Math.ceil(Math.max(13 + 14 + 10, 10 + clock.implicitWidth + 12))

  Rectangle {
    id: dot
    anchors.left: parent.left
    anchors.leftMargin: 15
    anchors.verticalCenter: parent.verticalCenter
    width: 10
    height: 10
    radius: 5
    color: root.island.urgent
    visible: !root.busy

    SequentialAnimation on opacity {
      running: root.shown && !root.busy && !Style.reduceMotion
      loops: Animation.Infinite
      alwaysRunToEnd: true
      NumberAnimation { to: 0.3; duration: 700; easing.type: Easing.OutCubic }
      NumberAnimation { to: 1; duration: 700; easing.type: Easing.OutCubic }
    }
  }

  ProgressRing {
    anchors.left: parent.left
    anchors.leftMargin: 13
    anchors.verticalCenter: parent.verticalCenter
    width: 14
    height: 14
    visible: root.busy
    spinning: root.busy
    color: root.island.inkSecondary
  }

  IslandText {
    id: clock
    anchors.right: parent.right
    anchors.rightMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    text: Model.formatClock(root.recording.elapsedMs, false)
    font.pixelSize: Style.font.body
    font.bold: true
    color: root.busy ? root.island.inkSecondary : root.island.urgent
    elide: Text.ElideNone
    opacity: root.recording.recording ? 1 : 0
  }
}
