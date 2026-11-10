import QtQuick
import Quickshell.Widgets
import qs.Commons
import qs.Ui
import "../IslandModel.js" as Model
import "../components"

// Music beside the notch: the cover on its left, an equalizer on its right.
// A peek, when the track changes, adds the title and artist for a moment.
Reveal {
  id: root

  required property var island
  property bool peek: false

  readonly property var media: island.media
  readonly property bool showTitle: peek && media.title !== ""
  readonly property bool showArtist: peek && media.artist !== ""
  // Measured apart from the text items, which are sized from these.
  TextMetrics {
    id: titleMetrics
    font: titleText.font
    text: titleText.text
  }

  TextMetrics {
    id: artistMetrics
    font: artistText.font
    text: artistText.text
  }

  readonly property real titleWidth: Math.min(Math.ceil(titleMetrics.advanceWidth) + 1, 132)
  readonly property real artistWidth: Math.min(Math.ceil(artistMetrics.advanceWidth) + 1, 112)

  // How far the island reaches past each side of the notch. Both sides are
  // the same, so the island stays centered on it.
  readonly property real wing: Math.ceil(Math.max(
    10 + cover.width + (showTitle ? 8 + titleWidth : 0) + 10,
    10 + (showArtist ? artistWidth + 8 : 0) + equalizer.implicitWidth + 12))

  ClippingRectangle {
    id: cover
    anchors.left: parent.left
    anchors.leftMargin: 10
    anchors.verticalCenter: parent.verticalCenter
    width: 20
    height: 20
    radius: 6
    color: Qt.rgba(1, 1, 1, 0.14)

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
      font.pixelSize: Style.font.bodySmall
      color: root.island.inkSecondary
      elide: Text.ElideNone
    }
  }

  IslandText {
    id: titleText
    anchors.left: cover.right
    anchors.leftMargin: 8
    anchors.verticalCenter: parent.verticalCenter
    width: root.titleWidth
    text: root.media.title
    font.pixelSize: Style.font.bodySmall
    font.bold: true
    color: root.island.ink
    opacity: root.showTitle ? 1 : 0

    Behavior on opacity {
      NumberAnimation { duration: Style.duration(root.showTitle ? 180 : 110); easing.type: Easing.OutCubic }
    }
  }

  Equalizer {
    id: equalizer
    anchors.right: parent.right
    anchors.rightMargin: 12
    anchors.verticalCenter: parent.verticalCenter
    active: root.shown && root.media.playing
    color: root.island.accent
  }

  IslandText {
    id: artistText
    anchors.right: equalizer.left
    anchors.rightMargin: 8
    anchors.verticalCenter: parent.verticalCenter
    width: root.artistWidth
    horizontalAlignment: Text.AlignRight
    text: root.media.artist
    font.pixelSize: Style.font.bodySmall
    color: root.island.inkSecondary
    opacity: root.showArtist ? 1 : 0

    Behavior on opacity {
      NumberAnimation { duration: Style.duration(root.showArtist ? 180 : 110); easing.type: Easing.OutCubic }
    }
  }
}
