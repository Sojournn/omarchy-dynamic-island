import QtQuick
import qs.Commons
import "../IslandModel.js" as Model

// Bars that dance while something plays and settle to a row of dots when it
// stops. They are a sign of life, not a reading of the audio.
Item {
  id: root

  // Whether the bars move.
  property bool active: false
  property color color: "#f7f7f7"
  property int bars: 5
  property real barWidth: 2.5
  property real gap: 2
  property real barHeight: 14

  property int step: 0

  implicitWidth: Math.ceil(bars * barWidth + (bars - 1) * gap)
  implicitHeight: barHeight

  Timer {
    interval: 150
    repeat: true
    running: root.active && root.visible && !Style.reduceMotion
    onTriggered: root.step += 1
  }

  Row {
    anchors.centerIn: parent
    height: root.barHeight
    spacing: root.gap

    Repeater {
      model: root.bars

      Rectangle {
        required property int index

        anchors.verticalCenter: parent.verticalCenter
        width: root.barWidth
        radius: width / 2
        color: root.color
        height: Math.max(root.barWidth, root.barHeight * (root.active ? Model.barLevel(index, root.step) : 0))

        Behavior on height {
          NumberAnimation { duration: Style.duration(150); easing.type: Easing.OutCubic }
        }
      }
    }
  }
}
