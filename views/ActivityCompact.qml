import QtQuick
import qs.Commons
import "../IslandModel.js" as Model
import "../components"

// An activity another program reported, beside the notch: its icon on the
// left, wrapped in a ring when it has a progress, and on the right that
// progress, its own short text, or how long it has been going.
Reveal {
  id: root

  required property var island
  readonly property var activities: island.activities

  // Held while fading out, so the view does not empty before it has gone.
  property var held: null
  readonly property var current: activities.current
  onCurrentChanged: if (current) held = current

  readonly property var item: held || ({})
  readonly property bool measured: item.fraction !== undefined && item.fraction >= 0
  readonly property color tone: island.toneColor(item.tone)
  readonly property string readout: Model.activityReadout(held, activities.now, island.percentText)

  TextMetrics {
    id: readoutMetrics
    font: label.font
    text: label.text
  }

  readonly property real readoutWidth: Math.min(Math.ceil(readoutMetrics.advanceWidth) + 1, 124)
  readonly property real wing: Math.ceil(Math.max(12 + 20 + 10, 10 + readoutWidth + 12))

  Item {
    id: badge
    anchors.left: parent.left
    anchors.leftMargin: 11
    anchors.verticalCenter: parent.verticalCenter
    width: 20
    height: 20

    ProgressRing {
      anchors.fill: parent
      visible: root.measured
      fraction: root.measured ? root.item.fraction : 0
      stroke: 2
      color: root.tone
    }

    IslandText {
      anchors.centerIn: parent
      text: root.item.glyph || ""
      // Inside the ring the icon steps back to make room for it.
      font.pixelSize: root.measured ? Style.font.caption : Style.font.heading
      color: root.tone
      elide: Text.ElideNone
    }
  }

  IslandText {
    id: label
    anchors.right: parent.right
    anchors.rightMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    width: root.readoutWidth
    horizontalAlignment: Text.AlignRight
    text: root.readout
    font.pixelSize: Style.font.bodySmall
    font.bold: true
    color: root.tone
  }
}
