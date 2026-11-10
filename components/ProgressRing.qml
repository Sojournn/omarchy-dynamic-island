import QtQuick
import QtQuick.Shapes
import qs.Commons

// A ring that empties as `fraction` goes from 1 to 0. With `spinning` it is a
// short arc going round instead, for work of unknown length.
Item {
  id: root

  property real fraction: 1
  property color color: "#f7f7f7"
  property color track: Qt.rgba(1, 1, 1, 0.18)
  property real stroke: 2.5
  property bool spinning: false

  implicitWidth: 16
  implicitHeight: 16

  // The tick that drives `fraction` lands five times a second; easing between
  // ticks at a constant rate keeps the ring from stepping.
  property real drawn: fraction
  Behavior on drawn {
    enabled: !root.spinning
    NumberAnimation { duration: Style.duration(200); easing.type: Easing.Linear }
  }

  Shape {
    id: shape
    anchors.fill: parent
    preferredRendererType: Shape.CurveRenderer

    ShapePath {
      strokeColor: root.track
      strokeWidth: root.stroke
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap

      PathAngleArc {
        centerX: shape.width / 2
        centerY: shape.height / 2
        radiusX: (shape.width - root.stroke) / 2
        radiusY: (shape.height - root.stroke) / 2
        startAngle: 0
        sweepAngle: 360
      }
    }

    ShapePath {
      strokeColor: root.color
      strokeWidth: root.stroke
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap

      PathAngleArc {
        centerX: shape.width / 2
        centerY: shape.height / 2
        radiusX: (shape.width - root.stroke) / 2
        radiusY: (shape.height - root.stroke) / 2
        startAngle: -90
        sweepAngle: root.spinning ? 90 : 360 * Math.max(0, Math.min(1, root.drawn))
      }
    }

    RotationAnimator on rotation {
      from: 0
      to: 360
      duration: 900
      loops: Animation.Infinite
      running: root.spinning && root.visible && !Style.reduceMotion
    }
  }
}
