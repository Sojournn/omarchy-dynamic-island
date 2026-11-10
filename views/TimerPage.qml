import QtQuick
import qs.Commons
import "../IslandModel.js" as Model
import "../components"

// The open island's timer page. Idle, it sets a timer: a length to nudge,
// presets, and Start. Running, it shows what is left with pause, +1m and
// cancel. Done, it says so until dismissed.
Reveal {
  id: root

  required property var island
  readonly property var timer: island.timer
  readonly property string status: timer.status
  readonly property bool counting: status === "running" || status === "paused"

  implicitHeight: 88

  // ------------------------------------------------------------------ idle

  Reveal {
    anchors.fill: parent
    shown: root.status === "idle"

    Row {
      id: dial
      anchors.horizontalCenter: parent.horizontalCenter
      y: 2
      spacing: 14

      IslandButton {
        anchors.verticalCenter: parent.verticalCenter
        glyph: Model.glyphs.minus
        size: 28
        glyphSize: Style.font.title
        enabled: root.timer.draftMinutes > 1
        onClicked: root.timer.nudgeDraft(-1)
      }

      IslandText {
        anchors.verticalCenter: parent.verticalCenter
        width: Math.ceil(dialMetrics.advanceWidth) + 2
        horizontalAlignment: Text.AlignHCenter
        text: Model.formatClock(root.timer.draftMinutes * 60000, false)
        font.pixelSize: Style.font.displayLarge
        font.bold: true
        color: root.island.ink
        elide: Text.ElideNone
      }

      IslandButton {
        anchors.verticalCenter: parent.verticalCenter
        glyph: Model.glyphs.plus
        size: 28
        glyphSize: Style.font.title
        enabled: root.timer.draftMinutes < 600
        onClicked: root.timer.nudgeDraft(1)
      }
    }

    // As wide as the widest time the dial shows, so the buttons hold still.
    TextMetrics {
      id: dialMetrics
      font.family: Style.font.family
      font.pixelSize: Style.font.displayLarge
      font.bold: true
      text: "00:00:00"
    }

    Row {
      anchors.left: parent.left
      anchors.bottom: parent.bottom
      spacing: 6

      Repeater {
        model: root.island.settings.timerPresets

        IslandButton {
          required property var modelData

          label: root.island.strings.t("timer.minutes").arg(I18n.formatNumber(modelData))
          size: 28
          checked: root.timer.draftMinutes === modelData
          tint: checked ? root.island.accent : "#ffffff"
          onClicked: root.timer.draftMinutes = modelData
        }
      }
    }

    IslandButton {
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      glyph: Model.glyphs.play
      glyphSize: Style.font.title
      label: root.island.strings.t("timer.start")
      size: 28
      filled: true
      tint: root.island.accent
      onClicked: root.timer.startDraft()
    }
  }

  // --------------------------------------------------------------- counting

  Reveal {
    anchors.fill: parent
    shown: root.counting

    Column {
      anchors.left: parent.left
      anchors.right: controls.left
      anchors.rightMargin: 12
      y: 2
      spacing: 0

      IslandText {
        text: Model.formatClock(root.timer.remainingMs, true)
        font.pixelSize: Style.font.displayLarge
        font.bold: true
        color: root.status === "paused" ? root.island.inkSecondary : root.island.ink
        elide: Text.ElideNone
      }

      IslandText {
        width: parent.width
        text: root.status !== "paused" ? root.timer.label
          : root.timer.label !== "" ? root.island.strings.t("timer.pausedLabel").arg(root.timer.label)
          : root.island.strings.t("timer.paused")
        visible: text !== ""
        font.pixelSize: Style.font.bodySmall
        color: root.island.inkSecondary
      }
    }

    Row {
      id: controls
      anchors.right: parent.right
      y: 8
      spacing: 8

      IslandButton {
        glyph: root.status === "paused" ? Model.glyphs.play : Model.glyphs.pause
        size: 34
        onClicked: root.timer.toggle()
      }

      IslandButton {
        label: root.island.strings.t("timer.addMinute")
        size: 34
        onClicked: root.timer.add(60000)
      }

      IslandButton {
        glyph: Model.glyphs.close
        size: 34
        onClicked: root.timer.cancel()
      }
    }

    Rectangle {
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      anchors.bottomMargin: 4
      height: 4
      radius: 2
      color: Qt.rgba(1, 1, 1, 0.16)

      Rectangle {
        width: parent.width * root.timer.fraction
        height: parent.height
        radius: 2
        color: root.status === "paused" ? root.island.inkSecondary : root.island.accent

        Behavior on width {
          NumberAnimation { duration: Style.duration(200); easing.type: Easing.Linear }
        }
      }
    }
  }

  // ------------------------------------------------------------------- done

  Reveal {
    anchors.fill: parent
    shown: root.status === "done"

    Column {
      anchors.left: parent.left
      anchors.right: doneControls.left
      anchors.rightMargin: 12
      anchors.verticalCenter: parent.verticalCenter
      spacing: 2

      IslandText {
        width: parent.width
        text: root.island.strings.t("timer.done")
        font.pixelSize: Style.font.display
        font.bold: true
        color: root.island.accent
      }

      IslandText {
        width: parent.width
        visible: root.timer.label !== ""
        text: root.timer.label
        font.pixelSize: Style.font.bodySmall
        color: root.island.inkSecondary
      }
    }

    Row {
      id: doneControls
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      spacing: 8

      IslandButton {
        glyph: Model.glyphs.restart
        glyphSize: Style.font.title
        label: root.island.strings.t("timer.again")
        size: 32
        onClicked: root.timer.again()
      }

      IslandButton {
        label: root.island.strings.t("timer.dismiss")
        size: 32
        filled: true
        tint: root.island.accent
        onClicked: root.timer.dismiss()
      }
    }
  }
}
