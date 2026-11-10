import QtQuick
import qs.Commons
import "../IslandModel.js" as Model
import "../components"

// A coding agent waiting on the user, beside the notch: a red robot that
// beats until its terminal is looked at. An agent that merely finished is
// announced as an event and does not stay here.
Reveal {
  id: root

  required property var island
  readonly property var agents: island.agents
  readonly property int count: agents.summary.input

  readonly property real wing: Math.ceil(Math.max(12 + 18 + 10, 10 + label.implicitWidth + 12))

  IslandText {
    anchors.left: parent.left
    anchors.leftMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    width: 18
    horizontalAlignment: Text.AlignHCenter
    text: Model.glyphs.robot
    font.pixelSize: Style.font.heading
    color: root.island.urgent
    elide: Text.ElideNone

    SequentialAnimation on opacity {
      running: root.shown && !Style.reduceMotion
      loops: Animation.Infinite
      alwaysRunToEnd: true
      NumberAnimation { to: 0.4; duration: 650; easing.type: Easing.OutCubic }
      NumberAnimation { to: 1; duration: 650; easing.type: Easing.OutCubic }
    }
  }

  IslandText {
    id: label
    anchors.right: parent.right
    anchors.rightMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    text: root.count > 1
      ? root.island.strings.t("agents.inputCount").arg(I18n.formatNumber(root.count))
      : root.island.strings.t("agents.inputShort")
    font.pixelSize: Style.font.bodySmall
    font.bold: true
    color: root.island.urgent
    elide: Text.ElideNone
  }
}
