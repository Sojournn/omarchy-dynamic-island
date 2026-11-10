import QtQuick
import qs.Commons
import "../IslandModel.js" as Model
import "../components"

// The open island's agents page: each coding agent that finished or is
// waiting on the user, newest first. Clicking one brings its terminal
// forward, which is also what clears it.
Reveal {
  id: root

  required property var island
  readonly property var agents: island.agents
  readonly property var shownSessions: agents.sessions.slice(0, 4)
  readonly property int rowHeight: 30

  implicitHeight: shownSessions.length > 0 ? shownSessions.length * rowHeight + 8 + 26 : 58

  Column {
    visible: root.shownSessions.length === 0
    width: parent.width
    topPadding: 6
    spacing: 4

    IslandText {
      text: root.island.strings.t("agents.none")
      font.pixelSize: Style.font.title
      font.bold: true
      color: root.island.inkSecondary
    }

    IslandText {
      width: parent.width
      text: root.island.strings.t("agents.noneHint")
      font.pixelSize: Style.font.bodySmall
      color: root.island.inkTertiary
    }
  }

  Column {
    width: parent.width

    Repeater {
      model: root.shownSessions

      Item {
        id: row

        required property var modelData
        readonly property bool waiting: modelData.state === "input"
        readonly property color tone: waiting ? root.island.urgent : root.island.accent

        width: parent.width
        height: root.rowHeight

        Rectangle {
          anchors.fill: parent
          anchors.leftMargin: -8
          anchors.rightMargin: -8
          anchors.topMargin: 1
          anchors.bottomMargin: 1
          radius: 9
          color: Qt.rgba(1, 1, 1, rowMouse.pressed ? 0.16 : rowMouse.containsMouse ? 0.09 : 0)

          Behavior on color {
            ColorAnimation { duration: Style.duration(110); easing.type: Easing.OutCubic }
          }
        }

        IslandText {
          id: robot
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          width: 18
          horizontalAlignment: Text.AlignHCenter
          text: Model.glyphs.robot
          font.pixelSize: Style.font.heading
          color: row.tone
          elide: Text.ElideNone
        }

        IslandText {
          id: name
          anchors.left: robot.right
          anchors.leftMargin: 9
          anchors.verticalCenter: parent.verticalCenter
          text: Model.agentName(row.modelData.agent)
          font.pixelSize: Style.font.body
          font.bold: true
          color: root.island.ink
          elide: Text.ElideNone
        }

        IslandText {
          anchors.left: name.right
          anchors.leftMargin: 8
          anchors.right: status.left
          anchors.rightMargin: 10
          anchors.verticalCenter: parent.verticalCenter
          text: row.modelData.project
          font.pixelSize: Style.font.bodySmall
          color: root.island.inkTertiary
        }

        IslandText {
          id: status
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          text: root.island.strings.t(row.waiting ? "agents.input" : "agents.done")
          font.pixelSize: Style.font.bodySmall
          font.bold: true
          color: row.tone
          elide: Text.ElideNone
        }

        MouseArea {
          id: rowMouse
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: {
            root.island.collapse()
            root.agents.reveal(row.modelData)
          }
        }
      }
    }
  }

  IslandButton {
    visible: root.shownSessions.length > 0
    anchors.right: parent.right
    anchors.bottom: parent.bottom
    glyph: Model.glyphs.close
    glyphSize: Style.font.bodySmall
    label: root.island.strings.t("agents.clear")
    size: 26
    onClicked: root.agents.clear()
  }
}
