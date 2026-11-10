import QtQuick
import qs.Commons
import "../IslandModel.js" as Model
import "../components"

// The open island's activities page: what other programs have going, newest
// first, each with its progress or how long it has run. Clicking one that
// named a window brings that window forward.
Reveal {
  id: root

  required property var island
  readonly property var activities: island.activities
  readonly property var shownItems: activities.items.slice(0, 4)
  readonly property int rowHeight: 34

  implicitHeight: shownItems.length > 0 ? shownItems.length * rowHeight + 4 : 58

  Column {
    visible: root.shownItems.length === 0
    width: parent.width
    topPadding: 6
    spacing: 4

    IslandText {
      text: root.island.strings.t("activities.none")
      font.pixelSize: Style.font.title
      font.bold: true
      color: root.island.inkSecondary
    }

    IslandText {
      width: parent.width
      text: root.island.strings.t("activities.noneHint")
      font.pixelSize: Style.font.bodySmall
      color: root.island.inkTertiary
    }
  }

  Column {
    width: parent.width

    Repeater {
      model: root.shownItems

      Item {
        id: row

        required property var modelData
        readonly property bool measured: modelData.fraction >= 0
        readonly property bool reachable: modelData.window !== ""
        readonly property color tone: root.island.toneColor(modelData.tone)

        width: parent.width
        height: root.rowHeight

        Rectangle {
          anchors.fill: parent
          anchors.leftMargin: -8
          anchors.rightMargin: -8
          anchors.topMargin: 1
          anchors.bottomMargin: 1
          radius: 9
          color: Qt.rgba(1, 1, 1, !row.reachable ? 0 : rowMouse.pressed ? 0.16 : rowMouse.containsMouse ? 0.09 : 0)

          Behavior on color {
            ColorAnimation { duration: Style.duration(110); easing.type: Easing.OutCubic }
          }
        }

        IslandText {
          id: icon
          anchors.left: parent.left
          anchors.verticalCenter: title.verticalCenter
          width: 18
          horizontalAlignment: Text.AlignHCenter
          text: row.modelData.glyph
          font.pixelSize: Style.font.heading
          color: row.tone
          elide: Text.ElideNone
        }

        IslandText {
          id: title
          anchors.left: icon.right
          anchors.leftMargin: 9
          y: 5
          width: Math.min(implicitWidth, parent.width - 18 - 9 - readout.width - 20)
          text: row.modelData.title
          font.pixelSize: Style.font.body
          font.bold: true
          color: root.island.ink
        }

        IslandText {
          anchors.left: title.right
          anchors.leftMargin: 8
          anchors.right: readout.left
          anchors.rightMargin: 10
          anchors.verticalCenter: title.verticalCenter
          // With a progress showing, the text has no other place to go.
          visible: row.measured
          text: row.modelData.text
          font.pixelSize: Style.font.bodySmall
          color: root.island.inkTertiary
        }

        IslandText {
          id: readout
          anchors.right: parent.right
          anchors.verticalCenter: title.verticalCenter
          text: Model.activityReadout(row.modelData, root.activities.now, root.island.percentText)
          font.pixelSize: Style.font.bodySmall
          font.bold: true
          color: row.tone
          elide: Text.ElideNone
        }

        Rectangle {
          visible: row.measured
          anchors.left: icon.right
          anchors.leftMargin: 9
          anchors.right: parent.right
          anchors.bottom: parent.bottom
          anchors.bottomMargin: 5
          height: 3
          radius: 1.5
          color: Qt.rgba(1, 1, 1, 0.16)

          Rectangle {
            anchors.left: parent.left
            width: parent.width * Math.max(0, Math.min(1, row.modelData.fraction))
            height: parent.height
            radius: 1.5
            color: row.tone
          }
        }

        MouseArea {
          id: rowMouse
          anchors.fill: parent
          enabled: row.reachable
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: {
            root.island.collapse()
            root.activities.reveal(row.modelData)
          }
        }
      }
    }
  }
}
