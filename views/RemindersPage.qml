import QtQuick
import qs.Commons
import "../IslandModel.js" as Model
import "../components"

// The open island's reminders page: the next few Omarchy reminders with the
// time each has left, and a way to set another. A reminder with a message is
// written in Omarchy's own flow, which takes the keyboard.
Reveal {
  id: root

  required property var island
  readonly property var reminders: island.reminders
  readonly property var shownItems: reminders.items.slice(0, 3)
  readonly property int rowHeight: 24

  implicitHeight: (shownItems.length > 0 ? shownItems.length * rowHeight : rowHeight) + 12 + 28

  onShownChanged: if (shown) reminders.tick()

  // The countdowns move while the page is looked at.
  Timer {
    interval: 1000
    repeat: true
    running: root.shown && root.reminders.items.length > 0
    onTriggered: root.reminders.tick()
  }

  IslandText {
    visible: root.shownItems.length === 0
    height: root.rowHeight
    text: root.island.strings.t("reminders.none")
    font.pixelSize: Style.font.title
    font.bold: true
    color: root.island.inkSecondary
  }

  Column {
    width: parent.width

    Repeater {
      model: root.shownItems

      Item {
        required property var modelData
        required property int index

        width: parent.width
        height: root.rowHeight

        IslandText {
          id: bell
          anchors.left: parent.left
          anchors.verticalCenter: parent.verticalCenter
          width: 18
          horizontalAlignment: Text.AlignHCenter
          text: Model.glyphs.bell
          font.pixelSize: Style.font.title
          color: index === 0 ? root.island.accent : root.island.inkTertiary
          elide: Text.ElideNone
        }

        IslandText {
          anchors.left: bell.right
          anchors.leftMargin: 8
          anchors.right: remaining.left
          anchors.rightMargin: 12
          anchors.verticalCenter: parent.verticalCenter
          text: modelData.label
          font.pixelSize: Style.font.body
          font.bold: index === 0
          color: index === 0 ? root.island.ink : root.island.inkSecondary
        }

        IslandText {
          id: remaining
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          text: Model.formatClock(Math.max(0, modelData.at - root.reminders.now), true)
          font.pixelSize: Style.font.body
          font.bold: true
          color: index === 0 ? root.island.accent : root.island.inkSecondary
          elide: Text.ElideNone
        }
      }
    }
  }

  Row {
    anchors.left: parent.left
    anchors.bottom: parent.bottom
    spacing: 6

    Repeater {
      model: root.island.settings.reminderPresets.slice(0, 4)

      IslandButton {
        required property var modelData

        label: modelData % 60 === 0
          ? root.island.strings.t("reminders.hours").arg(I18n.formatNumber(modelData / 60))
          : root.island.strings.t("timer.minutes").arg(I18n.formatNumber(modelData))
        size: 28
        onClicked: root.reminders.add(modelData)
      }
    }
  }

  Row {
    anchors.right: parent.right
    anchors.bottom: parent.bottom
    spacing: 6

    IslandButton {
      visible: root.reminders.items.length > 0
      glyph: Model.glyphs.close
      glyphSize: Style.font.body
      size: 28
      onClicked: root.reminders.clear()
    }

    IslandButton {
      glyph: Model.glyphs.plus
      glyphSize: Style.font.body
      label: root.island.strings.t("reminders.new")
      size: 28
      filled: true
      tint: root.island.accent
      onClicked: {
        // Omarchy's flow needs the keyboard and the screen to itself.
        root.island.collapse()
        root.reminders.compose()
      }
    }
  }
}
