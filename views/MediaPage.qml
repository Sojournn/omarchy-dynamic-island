import QtQuick
import Quickshell.Widgets
import qs.Commons
import qs.Ui
import "../IslandModel.js" as Model
import "../components"

// The open island's music page: cover, title and artist, a seekable progress
// line when the player reports one, and transport controls.
Reveal {
  id: root

  required property var island
  readonly property var media: island.media
  readonly property bool timed: media.length > 0

  implicitHeight: media.available ? layout.implicitHeight : empty.implicitHeight

  onShownChanged: if (shown) media.syncPosition()

  // MPRIS does not report the position as it moves, so the page asks while it
  // is on screen.
  Timer {
    interval: 500
    repeat: true
    running: root.shown && root.media.playing && root.timed
    onTriggered: root.media.syncPosition()
  }

  Column {
    id: empty
    visible: !root.media.available
    width: parent.width
    topPadding: 10
    bottomPadding: 10
    spacing: 6

    IslandText {
      anchors.horizontalCenter: parent.horizontalCenter
      text: Model.glyphs.music
      font.pixelSize: Style.font.display
      color: root.island.inkTertiary
      elide: Text.ElideNone
    }

    IslandText {
      anchors.horizontalCenter: parent.horizontalCenter
      text: root.island.strings.t("media.nothing")
      font.pixelSize: Style.font.title
      font.bold: true
      color: root.island.inkSecondary
    }

    IslandText {
      anchors.horizontalCenter: parent.horizontalCenter
      text: root.island.strings.t("media.nothingHint")
      font.pixelSize: Style.font.bodySmall
      color: root.island.inkTertiary
    }
  }

  Column {
    id: layout
    visible: root.media.available
    width: parent.width
    spacing: 10

    Item {
      width: parent.width
      height: 56

      ClippingRectangle {
        id: cover
        anchors.left: parent.left
        width: 56
        height: 56
        radius: 13
        color: Qt.rgba(1, 1, 1, 0.1)

        SizedImage {
          anchors.fill: parent
          crop: true
          url: root.media.artUrl
          visible: root.media.artUrl !== ""
        }

        IslandText {
          anchors.centerIn: parent
          visible: root.media.artUrl === ""
          text: Model.glyphs.music
          font.pixelSize: Style.font.display
          color: root.island.inkTertiary
          elide: Text.ElideNone
        }
      }

      Column {
        anchors.left: cover.right
        anchors.leftMargin: 12
        anchors.right: equalizer.left
        anchors.rightMargin: 12
        anchors.verticalCenter: parent.verticalCenter
        spacing: 3

        IslandText {
          width: parent.width
          text: root.media.title !== "" ? root.media.title : root.island.strings.t("media.unknownTitle")
          font.pixelSize: Style.font.title
          font.bold: true
          color: root.island.ink
        }

        IslandText {
          width: parent.width
          text: root.media.artist !== "" ? root.media.artist : root.media.identity
          font.pixelSize: Style.font.bodySmall
          color: root.island.inkSecondary
        }
      }

      Equalizer {
        id: equalizer
        anchors.right: parent.right
        anchors.rightMargin: 2
        anchors.verticalCenter: parent.verticalCenter
        bars: 5
        barHeight: 18
        active: root.shown && root.media.playing
        color: root.island.accent
      }
    }

    Item {
      visible: root.timed
      width: parent.width
      height: 14

      IslandText {
        id: elapsed
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        text: Model.formatClock(root.media.position * 1000, false)
        font.pixelSize: Style.font.caption
        color: root.island.inkTertiary
        elide: Text.ElideNone
      }

      IslandText {
        id: remaining
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        text: "-" + Model.formatClock(Math.max(0, root.media.length - root.media.position) * 1000, true)
        font.pixelSize: Style.font.caption
        color: root.island.inkTertiary
        elide: Text.ElideNone
      }

      Item {
        id: line
        anchors.left: elapsed.right
        anchors.leftMargin: 10
        anchors.right: remaining.left
        anchors.rightMargin: 10
        height: parent.height

        readonly property bool hot: seek.containsMouse && root.media.canSeek
        property real thickness: hot ? 6 : 4

        Behavior on thickness {
          NumberAnimation { duration: Style.duration(120); easing.type: Easing.OutCubic }
        }

        Rectangle {
          anchors.verticalCenter: parent.verticalCenter
          width: parent.width
          height: line.thickness
          radius: height / 2
          color: Qt.rgba(1, 1, 1, 0.18)

          Rectangle {
            width: parent.width * Math.max(0, Math.min(1, root.media.length > 0 ? root.media.position / root.media.length : 0))
            height: parent.height
            radius: height / 2
            color: line.hot ? root.island.accent : root.island.ink
          }
        }

        MouseArea {
          id: seek
          anchors.fill: parent
          anchors.margins: -4
          hoverEnabled: true
          cursorShape: root.media.canSeek ? Qt.PointingHandCursor : Qt.ArrowCursor
          onClicked: function(mouse) {
            root.media.seekTo((mouse.x - 4) / line.width)
          }
        }
      }
    }

    Item {
      width: parent.width
      height: 38

      Row {
        anchors.centerIn: parent
        spacing: 14

        IslandButton {
          anchors.verticalCenter: parent.verticalCenter
          glyph: Model.glyphs.previous
          size: 32
          restAlpha: 0
          enabled: root.media.canPrevious
          onClicked: root.media.previous()
        }

        IslandButton {
          anchors.verticalCenter: parent.verticalCenter
          glyph: root.media.playing ? Model.glyphs.pause : Model.glyphs.play
          size: 38
          glyphSize: Style.font.display
          enabled: root.media.canToggle
          onClicked: root.media.toggle()
        }

        IslandButton {
          anchors.verticalCenter: parent.verticalCenter
          glyph: Model.glyphs.next
          size: 32
          restAlpha: 0
          enabled: root.media.canNext
          onClicked: root.media.next()
        }
      }

      // With more than one player about, which one this is, and a way to the
      // next.
      IslandButton {
        visible: root.media.choices.length > 1
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        glyph: Model.glyphs.swap
        label: Model.shortLabel(root.media.identity, 12)
        size: 26
        glyphSize: Style.font.body
        restAlpha: 0.08
        onClicked: root.media.switchPlayer(1)
      }
    }
  }
}
