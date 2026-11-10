import QtQuick
import qs.Commons

// A round button, or a pill when it carries a label. It gives a little when
// pressed, the way the shell's own buttons do.
Item {
  id: root

  property string glyph: ""
  property string label: ""
  property int size: 30
  property int glyphSize: Style.font.iconLarge
  property color foreground: "#f7f7f7"
  // The color the button is washed with at rest, on hover and when pressed.
  property color tint: "#ffffff"
  property real restAlpha: 0.1
  // A solid button in `tint`, for the one action that matters most.
  property bool filled: false
  // A toggle that is on.
  property bool checked: false

  readonly property bool hovered: mouse.containsMouse
  readonly property bool pressed: mouse.pressed

  signal clicked()

  implicitHeight: size
  implicitWidth: label !== "" ? Math.max(size, content.implicitWidth + 2 * Math.round(size * 0.45)) : size
  opacity: enabled ? 1 : 0.35
  scale: pressed ? 0.94 : 1

  Behavior on scale {
    NumberAnimation { duration: Style.duration(90); easing.type: Easing.OutCubic }
  }

  Behavior on opacity {
    NumberAnimation { duration: Style.duration(120); easing.type: Easing.OutCubic }
  }

  Rectangle {
    anchors.fill: parent
    radius: height / 2
    color: root.filled
      ? Util.alpha(root.tint, root.pressed ? 0.8 : root.hovered ? 0.9 : 1)
      : Util.alpha(root.tint, root.pressed ? 0.28 : root.hovered ? 0.2 : root.checked ? 0.22 : root.restAlpha)

    Behavior on color {
      ColorAnimation { duration: Style.duration(110); easing.type: Easing.OutCubic }
    }
  }

  Row {
    id: content
    anchors.centerIn: parent
    spacing: Math.round(root.size * 0.2)

    IslandText {
      visible: root.glyph !== ""
      anchors.verticalCenter: parent.verticalCenter
      text: root.glyph
      font.pixelSize: root.glyphSize
      color: root.filled ? "#000000" : root.checked ? root.tint : root.foreground
      elide: Text.ElideNone
    }

    IslandText {
      visible: root.label !== ""
      anchors.verticalCenter: parent.verticalCenter
      text: root.label
      font.pixelSize: Style.font.bodySmall
      font.bold: true
      color: root.filled ? "#000000" : root.checked ? root.tint : root.foreground
      elide: Text.ElideNone
    }
  }

  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
  }
}
