import QtQuick
import qs.Commons
import "../IslandModel.js" as Model
import "../components"

// The open island's recording page. Idle, it starts a recording of a region
// or the whole display, with or without sound. Recording, it shows the time
// and a Stop. The recording itself is Omarchy's own
// omarchy-capture-screenrecording; this page only drives it.
Reveal {
  id: root

  required property var island
  readonly property var recording: island.recording
  readonly property string phase: recording.busy ? "saving" : recording.recording ? "recording" : "idle"

  implicitHeight: 88

  // ------------------------------------------------------------------ idle

  Reveal {
    anchors.fill: parent
    shown: root.phase === "idle"

    IslandText {
      id: heading
      y: 2
      text: root.island.strings.t("recording.title")
      font.pixelSize: Style.font.title
      font.bold: true
      color: root.island.ink
    }

    Row {
      anchors.right: parent.right
      anchors.verticalCenter: heading.verticalCenter
      spacing: 6

      IslandButton {
        glyph: Model.glyphs.speaker
        glyphSize: Style.font.body
        label: root.island.strings.t("recording.audio")
        size: 24
        checked: root.recording.withAudio
        tint: checked ? root.island.accent : "#ffffff"
        onClicked: root.recording.withAudio = !root.recording.withAudio
      }

      IslandButton {
        glyph: Model.glyphs.microphone
        glyphSize: Style.font.body
        label: root.island.strings.t("recording.microphone")
        size: 24
        checked: root.recording.withMicrophone
        tint: checked ? root.island.accent : "#ffffff"
        onClicked: root.recording.withMicrophone = !root.recording.withMicrophone
      }
    }

    Row {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      spacing: 8

      IslandButton {
        width: (parent.width - parent.spacing) / 2
        glyph: Model.glyphs.region
        glyphSize: Style.font.title
        label: root.island.strings.t("recording.region")
        size: 36
        onClicked: {
          // The region picker needs the screen to itself.
          root.island.collapse()
          root.recording.start("region")
        }
      }

      IslandButton {
        width: (parent.width - parent.spacing) / 2
        glyph: Model.glyphs.display
        glyphSize: Style.font.title
        label: root.island.strings.t("recording.display")
        size: 36
        onClicked: {
          root.island.collapse()
          root.recording.start("display")
        }
      }
    }
  }

  // -------------------------------------------------------------- recording

  Reveal {
    anchors.fill: parent
    shown: root.phase === "recording"

    Rectangle {
      id: dot
      anchors.left: parent.left
      anchors.leftMargin: 2
      anchors.verticalCenter: parent.verticalCenter
      width: 14
      height: 14
      radius: 7
      color: root.island.urgent

      SequentialAnimation on opacity {
        running: root.shown && root.phase === "recording" && !Style.reduceMotion
        loops: Animation.Infinite
        alwaysRunToEnd: true
        NumberAnimation { to: 0.3; duration: 700; easing.type: Easing.OutCubic }
        NumberAnimation { to: 1; duration: 700; easing.type: Easing.OutCubic }
      }
    }

    Column {
      anchors.left: dot.right
      anchors.leftMargin: 14
      anchors.right: stop.left
      anchors.rightMargin: 12
      anchors.verticalCenter: parent.verticalCenter
      spacing: 0

      IslandText {
        text: Model.formatClock(root.recording.elapsedMs, false)
        font.pixelSize: Style.font.displayLarge
        font.bold: true
        color: root.island.ink
        elide: Text.ElideNone
      }

      IslandText {
        width: parent.width
        text: root.island.strings.t("recording.active")
        font.pixelSize: Style.font.bodySmall
        color: root.island.inkSecondary
      }
    }

    IslandButton {
      id: stop
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      glyph: Model.glyphs.stop
      glyphSize: Style.font.title
      label: root.island.strings.t("recording.stop")
      size: 36
      filled: true
      tint: root.island.urgent
      onClicked: root.recording.stop()
    }
  }

  // ----------------------------------------------------------------- saving

  Reveal {
    anchors.fill: parent
    shown: root.phase === "saving"

    Row {
      anchors.centerIn: parent
      spacing: 12

      ProgressRing {
        anchors.verticalCenter: parent.verticalCenter
        width: 18
        height: 18
        spinning: root.phase === "saving"
        color: root.island.ink
      }

      IslandText {
        anchors.verticalCenter: parent.verticalCenter
        text: root.island.strings.t("recording.saving")
        font.pixelSize: Style.font.title
        font.bold: true
        color: root.island.inkSecondary
      }
    }
  }
}
