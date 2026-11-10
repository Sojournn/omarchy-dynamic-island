import QtQuick
import qs.Commons
import "../IslandModel.js" as Model
import "../components"

// The next Omarchy reminder, once it is close: a bell and the time left.
Reveal {
  id: root

  required property var island
  readonly property var reminders: island.reminders

  readonly property real wing: Math.ceil(Math.max(12 + 18 + 10, 10 + clock.implicitWidth + 12))

  IslandText {
    anchors.left: parent.left
    anchors.leftMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    width: 18
    horizontalAlignment: Text.AlignHCenter
    text: Model.glyphs.bell
    font.pixelSize: Style.font.heading
    color: root.island.accent
    elide: Text.ElideNone
  }

  IslandText {
    id: clock
    anchors.right: parent.right
    anchors.rightMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    text: Model.formatClock(root.reminders.nextInMs, true)
    font.pixelSize: Style.font.body
    font.bold: true
    color: root.island.accent
    elide: Text.ElideNone
  }
}
