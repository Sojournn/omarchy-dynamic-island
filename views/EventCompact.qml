import QtQuick
import qs.Commons
import "../components"

// Something that just happened, beside the notch for a moment: a glyph and a
// few words on its left, and on its right a few more, or a level bar for
// volume and brightness.
Reveal {
  id: root

  required property var island

  // The event stays drawn while the island lets go of it, so its text does
  // not vanish before the fade has finished.
  property var held: null
  readonly property var current: island.event
  onCurrentChanged: if (current) held = current

  readonly property var event: held || ({})
  readonly property bool hasBar: event.fraction !== undefined && event.fraction >= 0
  readonly property color tone: island.toneColor(event.tone)

  // Measured apart from the text items themselves: an item sized from its own
  // layout came up blank the first time it went from empty to filled.
  TextMetrics {
    id: leadMetrics
    font: lead.font
    text: lead.text
  }

  TextMetrics {
    id: trailMetrics
    font: trail.font
    text: trail.text
  }

  readonly property real leadWidth: lead.text !== "" ? Math.min(Math.ceil(leadMetrics.advanceWidth) + 1, 136) : 0
  readonly property real trailWidth: hasBar ? 68 : (trail.text !== "" ? Math.min(Math.ceil(trailMetrics.advanceWidth) + 1, 124) : 0)

  readonly property real wing: Math.ceil(Math.max(44,
    12 + icon.width + (leadWidth > 0 ? 8 + leadWidth : 0) + 10,
    10 + trailWidth + 14))

  IslandText {
    id: icon
    anchors.left: parent.left
    anchors.leftMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    width: 18
    horizontalAlignment: Text.AlignHCenter
    text: root.event.glyph || ""
    font.pixelSize: Style.font.heading
    color: root.tone
    elide: Text.ElideNone
  }

  IslandText {
    id: lead
    anchors.left: icon.right
    anchors.leftMargin: 8
    anchors.verticalCenter: parent.verticalCenter
    width: root.leadWidth
    text: root.event.lead || ""
    font.pixelSize: Style.font.bodySmall
    font.bold: true
    color: root.island.ink
  }

  IslandText {
    id: trail
    visible: !root.hasBar
    anchors.right: parent.right
    anchors.rightMargin: 14
    anchors.verticalCenter: parent.verticalCenter
    width: root.trailWidth
    horizontalAlignment: Text.AlignRight
    text: root.event.trail || ""
    font.pixelSize: Style.font.bodySmall
    color: root.island.inkSecondary
  }

  Rectangle {
    visible: root.hasBar
    anchors.right: parent.right
    anchors.rightMargin: 14
    anchors.verticalCenter: parent.verticalCenter
    width: 68
    height: 5
    radius: 2.5
    color: Qt.rgba(1, 1, 1, 0.2)

    Rectangle {
      anchors.left: parent.left
      width: parent.width * Math.max(0, Math.min(1, root.hasBar ? root.event.fraction : 0))
      height: parent.height
      radius: 2.5
      color: root.island.ink

      // A held key moves the level in steps; the bar glides between them.
      Behavior on width {
        enabled: root.shown
        NumberAnimation { duration: Style.duration(120); easing.type: Easing.OutCubic }
      }
    }
  }
}
