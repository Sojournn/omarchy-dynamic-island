import QtQuick
import qs.Commons
import "../IslandModel.js" as Model
import "../components"

// Superwhisper dictation beside the notch. Listening is the part worth
// noticing: a red microphone and moving bars. What follows is kept quiet: a
// small grey spinner while speech becomes text, then a small check for a
// moment as the island goes back into the notch. Nothing is spelled out.
Reveal {
  id: root

  required property var island
  readonly property var dictation: island.dictation

  readonly property real wing: 12 + 18 + 12

  IslandText {
    anchors.left: parent.left
    anchors.leftMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    width: 18
    horizontalAlignment: Text.AlignHCenter
    text: Model.glyphs.microphone
    font.pixelSize: Style.font.heading
    color: root.dictation.recording ? root.island.urgent : root.island.inkTertiary
    elide: Text.ElideNone

    Behavior on color {
      ColorAnimation { duration: Style.duration(160); easing.type: Easing.OutCubic }
    }
  }

  // The three things the right side can be. They share a spot and trade
  // places by fading, so nothing jumps.
  Item {
    id: slot
    anchors.right: parent.right
    anchors.rightMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    width: 18
    height: 18

    Equalizer {
      anchors.centerIn: parent
      bars: 4
      active: root.shown && root.dictation.recording
      color: root.island.urgent
      opacity: root.dictation.recording ? 1 : 0

      Behavior on opacity {
        NumberAnimation { duration: Style.duration(root.dictation.recording ? 160 : 110); easing.type: Easing.OutCubic }
      }
    }

    ProgressRing {
      anchors.centerIn: parent
      width: 12
      height: 12
      stroke: 1.5
      spinning: root.shown && root.dictation.working
      color: root.island.inkSecondary
      track: Qt.rgba(1, 1, 1, 0.12)
      opacity: root.dictation.working ? 1 : 0

      Behavior on opacity {
        NumberAnimation { duration: Style.duration(root.dictation.working ? 160 : 110); easing.type: Easing.OutCubic }
      }
    }

    IslandText {
      anchors.centerIn: parent
      text: Model.glyphs.check
      font.pixelSize: Style.font.body
      color: root.island.accent
      elide: Text.ElideNone
      opacity: root.dictation.completing ? 1 : 0
      scale: root.dictation.completing ? 1 : 0.96

      Behavior on opacity {
        NumberAnimation { duration: Style.duration(root.dictation.completing ? 160 : 110); easing.type: Easing.OutCubic }
      }

      Behavior on scale {
        NumberAnimation { duration: Style.duration(160); easing.type: Easing.Bezier; easing.bezierCurve: Style.easeOut }
      }
    }
  }
}
