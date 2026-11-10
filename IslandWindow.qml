import QtQuick
import QtQuick.Shapes
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons
import "IslandModel.js" as Model
import "components"
import "views"

// One screen's island: a black shape hung from the top edge over the notch.
//
//   idle      a little smaller than the notch, so it is all behind the camera
//   indicator just wider than the notch, to carry a microphone or camera mark
//   compact   as tall as the notch and wider, an activity showing either side
//   event     the same, for a moment, showing something that just happened
//   expanded  grown downward into a page of controls
//
// The surface never changes size. The shape inside it does, and the input
// region follows the shape, so everything outside it stays clickable.
PanelWindow {
  id: win

  required property var island
  readonly property var settings: island.settings

  // ------------------------------------------------------------- the notch

  readonly property var monitor: screen ? Hyprland.monitorFor(screen) : null
  readonly property var panelMode: monitor ? ({
    width: monitor.width,
    height: monitor.height,
    transform: monitor.lastIpcObject ? monitor.lastIpcObject.transform : 0
  }) : null
  readonly property int cutout: screen
    ? Model.cutoutTop(island.cutouts, screen.name, screen.width, screen.height, screen.devicePixelRatio, panelMode) : 0
  readonly property int notchH: settings.notchHeight > 0 ? settings.notchHeight : cutout
  readonly property int notchW: island.calibrating && island.calibrationWidth > 0 ? island.calibrationWidth
    : settings.notchWidth > 0 ? settings.notchWidth
    : Model.defaultNotchWidth(notchH)

  // Only a screen with a notch gets an island.
  visible: cutout > 0
  color: "transparent"
  exclusionMode: ExclusionMode.Ignore
  anchors.top: true
  WlrLayershell.namespace: "omarchy-dynamic-island"
  WlrLayershell.layer: WlrLayer.Overlay
  WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

  // Room for the widest and tallest the shape gets. An even width, so the
  // compositor centers the surface on a whole pixel.
  implicitWidth: 2 * Math.ceil((Math.max(expandedW, notchW + 2 * 184) + 2 * ear + 8) / 2)
  implicitHeight: notchH + 236

  mask: Region { item: win.mode === "hidden" ? null : body }

  // Right-to-left languages read the island mirrored.
  Binding { target: win.contentItem; property: "LayoutMirroring.enabled"; value: Commons.I18n.rightToLeft }
  Binding { target: win.contentItem; property: "LayoutMirroring.childrenInherit"; value: true }

  // ------------------------------------------------------------------ mode

  readonly property var workspace: monitor ? monitor.activeWorkspace : null
  // The special workspace showing over this monitor, or 0. The screensaver
  // runs fullscreen on one.
  readonly property int specialId: monitor && monitor.lastIpcObject && monitor.lastIpcObject.specialWorkspace
    ? Number(monitor.lastIpcObject.specialWorkspace.id) || 0 : 0
  readonly property bool fullscreen: settings.hideInFullscreen
    && ((!!workspace && Model.fullscreenOn(Hyprland.toplevels.values, workspace.id))
      || (specialId !== 0 && Model.fullscreenOn(Hyprland.toplevels.values, specialId)))

  // Opened by the pointer resting on this island.
  property bool hoverExpanded: false
  readonly property bool expanded: island.pinned || island.alerting || hoverExpanded
  // A microphone or a camera in use. Each is a small mark at one end of the
  // island for as long as it lasts, whatever else the island is showing.
  readonly property bool microphoneOn: settings.microphone && island.privacy.microphoneOn
  readonly property bool cameraOn: settings.camera && island.privacy.cameraOn
  readonly property bool marked: microphoneOn || cameraOn

  readonly property string mode: fullscreen ? "hidden"
    : island.calibrating ? "calibrate"
    : expanded ? "expanded"
    : island.event ? "event"
    : island.compactId !== "" ? "compact"
    : marked ? "indicator"
    : "idle"

  // Whether this island is free to show an event: on a notch, in view, and
  // not open on a page. The service reads it to decide whether the island or
  // the on-screen display answers the volume keys.
  readonly property bool eventReady: cutout > 0
    && (mode === "idle" || mode === "indicator" || mode === "compact" || mode === "event")
  readonly property string screenName: screen ? String(screen.name) : ""

  function reportReady() {
    if (screenName !== "") island.setScreenReady(screenName, eventReady)
  }

  onEventReadyChanged: reportReady()
  onScreenNameChanged: reportReady()
  Component.onDestruction: if (screenName !== "") island.setScreenReady(screenName, false)

  // A track change shows the title beside the notch for a moment.
  property bool peekWanted: false
  readonly property bool peeking: peekWanted && mode === "compact" && island.compactId === "media"

  Timer {
    id: peekTimer
    interval: 3200
    onTriggered: win.peekWanted = false
  }

  Connections {
    target: win.island

    function onPeekRequested() {
      win.peekWanted = true
      peekTimer.restart()
    }

    function onCollapseRequested() {
      openTimer.stop()
      win.hoverExpanded = false
    }
  }

  // --------------------------------------------------------------- pointer

  function open() {
    if (!expanded) island.preparePage()
    hoverExpanded = true
  }

  function hoverChanged(hovered) {
    if (hovered) {
      collapseTimer.stop()
      if (!expanded && settings.expandOnHover && mode !== "calibrate") openTimer.restart()
    } else {
      openTimer.stop()
      if (hoverExpanded) collapseTimer.restart()
    }
  }

  function tapped() {
    if (mode === "calibrate") island.finishCalibration()
    else if (!expanded) open()
  }

  // A middle click anywhere on the island plays or pauses the music.
  function middleTapped() {
    if (mode !== "calibrate" && island.media.available) island.media.toggle()
  }

  property real wheelRemainder: 0

  function wheeled(delta) {
    var result = Util.wheelSteps(wheelRemainder, delta)
    wheelRemainder = result.remainder
    if (result.steps === 0) return
    var up = result.steps > 0
    if (mode === "calibrate") island.nudgeCalibration(notchW, up ? 1 : -1)
    else if (mode === "expanded") island.cyclePage(up ? -1 : 1)
    else if (mode === "compact") island.cycleCompact(up ? -1 : 1)
  }

  // A pointer passing over the notch on its way somewhere else should not
  // open the island, and one that slips off the edge should not close it.
  Timer {
    id: openTimer
    interval: Math.max(1, win.settings.hoverDelay)
    onTriggered: if (hover.hovered) win.open()
  }

  Timer {
    id: collapseTimer
    interval: Math.max(1, win.settings.collapseDelay)
    onTriggered: if (!hover.hovered) win.hoverExpanded = false
  }

  // ----------------------------------------------------------------- shape

  readonly property int ear: 7
  readonly property int pad: 16
  readonly property int pageTop: notchH + 6

  readonly property real idleW: Math.max(0, notchW - 10)
  readonly property real idleH: Math.max(0, notchH - 4)
  readonly property real expandedW: Math.max(settings.expandedWidth, notchW + 2 * 104)

  // Where a mark sits: this far in from an end of the island. An island that
  // is showing something moves it inward by `gutter` to make the room; one
  // that is not grows `markWing` past the notch to have somewhere to put it.
  readonly property int markSize: 6
  readonly property int markInset: 5
  readonly property int markWing: 16
  readonly property real gutter: marked && (mode === "compact" || mode === "event") ? 10 : 0
  property real inset: gutter

  Behavior on inset {
    enabled: win.ready
    NumberAnimation { duration: Style.duration(220); easing.type: Easing.Bezier; easing.bezierCurve: Style.easeOut }
  }

  readonly property var compactView: island.compactId === "media" ? mediaCompact
    : island.compactId === "timer" ? timerCompact
    : island.compactId === "recording" ? recordingCompact
    : island.compactId === "dictation" ? dictationCompact
    : island.compactId === "agents" ? agentsCompact
    : island.compactId === "reminders" ? remindersCompact
    : island.compactId === "activities" ? activityCompact
    : null
  readonly property var page: island.pageId === "media" ? mediaPage
    : island.pageId === "recording" ? recordingPage
    : island.pageId === "reminders" ? remindersPage
    : island.pageId === "agents" ? agentsPage
    : island.pageId === "activities" ? activitiesPage
    : timerPage

  readonly property real targetW: mode === "expanded" ? expandedW
    : mode === "compact" && compactView ? notchW + 2 * (compactView.wing + gutter)
    : mode === "event" ? notchW + 2 * (eventCompact.wing + gutter)
    : mode === "calibrate" ? notchW + 2 * 118
    : mode === "indicator" ? notchW + 2 * markWing
    : idleW
  readonly property real targetH: mode === "expanded" ? pageTop + page.implicitHeight + pad
    : mode === "compact" || mode === "event" || mode === "calibrate" || mode === "indicator" ? notchH
    : idleH
  readonly property real targetRadius: mode === "expanded" ? 30 : 11

  // The shape as drawn, eased toward its target. Growing takes a little
  // longer than shrinking; both start at once and settle without a bounce.
  property real bodyW: 0
  property real bodyH: 0
  property real bodyRadius: 11
  property int morphMs: 0
  property bool ready: false

  function retarget() {
    if (!ready) return
    morphMs = targetW * targetH >= bodyW * bodyH ? 270 : 190
    bodyW = targetW
    bodyH = targetH
    bodyRadius = targetRadius
  }

  onTargetWChanged: retarget()
  onTargetHChanged: retarget()
  onTargetRadiusChanged: retarget()

  Component.onCompleted: {
    bodyW = targetW
    bodyH = targetH
    bodyRadius = targetRadius
    ready = true
    reportReady()
  }

  Behavior on bodyW {
    enabled: win.ready
    NumberAnimation { duration: Style.duration(win.morphMs); easing.type: Easing.Bezier; easing.bezierCurve: Style.easeOut }
  }

  Behavior on bodyH {
    enabled: win.ready
    NumberAnimation { duration: Style.duration(win.morphMs); easing.type: Easing.Bezier; easing.bezierCurve: Style.easeOut }
  }

  Behavior on bodyRadius {
    enabled: win.ready
    NumberAnimation { duration: Style.duration(win.morphMs); easing.type: Easing.Bezier; easing.bezierCurve: Style.easeOut }
  }

  // How far the island has opened past the notch, 0 to 1.
  readonly property real openness: Math.max(0, Math.min(1, (bodyH - notchH) / 48))

  function pageGlyph(id) {
    return id === "media" ? Model.glyphs.music
      : id === "recording" ? Model.glyphs.record
      : id === "reminders" ? Model.glyphs.bell
      : id === "agents" ? Model.glyphs.robot
      : id === "activities" ? Model.icons.pulse
      : Model.glyphs.timer
  }

  // The first pages sit left of the notch and the rest right of it.
  readonly property int leftTabs: 3

  // A microphone or camera mark: a steady dot, there for as long as the use.
  component Mark: Rectangle {
    property bool on: false

    y: (win.notchH - height) / 2
    width: win.markSize
    height: win.markSize
    radius: win.markSize / 2
    opacity: on && win.mode !== "calibrate" ? 1 : 0

    Behavior on opacity {
      NumberAnimation { duration: Style.duration(180); easing.type: Easing.OutCubic }
    }
  }

  // A page tab in the strip beside the notch. A dot marks a live activity.
  component Tab: Item {
    id: tab

    property string pageId: ""
    readonly property bool current: win.island.pageId === pageId
    readonly property bool live: win.island.liveIds.indexOf(pageId) !== -1

    // An agent waiting on the user, like a recording, is marked in red.
    readonly property bool pressing: pageId === "recording" || (pageId === "agents" && win.island.agents.summary.input > 0)

    width: 28
    height: 26

    IslandText {
      anchors.centerIn: parent
      anchors.verticalCenterOffset: -1
      text: win.pageGlyph(tab.pageId)
      font.pixelSize: Style.font.title
      elide: Text.ElideNone
      color: tab.current ? win.island.ink : tabMouse.containsMouse ? win.island.inkSecondary : win.island.inkTertiary

      Behavior on color {
        ColorAnimation { duration: Style.duration(110); easing.type: Easing.OutCubic }
      }
    }

    Rectangle {
      anchors.horizontalCenter: parent.horizontalCenter
      anchors.bottom: parent.bottom
      width: 4
      height: 4
      radius: 2
      visible: tab.live
      color: tab.pressing ? win.island.urgent : win.island.accent
    }

    MouseArea {
      id: tabMouse
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: win.island.showPage(tab.pageId)
    }
  }

  Item {
    id: body

    anchors.horizontalCenter: parent.horizontalCenter
    width: win.bodyW
    height: win.bodyH
    // At rest in the notch there is nothing to see, and nothing is drawn, so
    // a screenshot shows the desktop and not a black tab.
    opacity: win.bodyW > win.idleW + 0.5 || win.bodyH > win.idleH + 0.5 ? 1 : 0

    HoverHandler {
      id: hover
      onHoveredChanged: win.hoverChanged(hovered)
    }

    TapHandler {
      onTapped: win.tapped()
    }

    TapHandler {
      acceptedButtons: Qt.MiddleButton
      onTapped: win.middleTapped()
    }

    WheelHandler {
      acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
      onWheel: function(event) { win.wheeled(event.angleDelta.y) }
    }

    // The plate reaches above the screen edge, so its top border and corners
    // are never on screen.
    Rectangle {
      y: -6
      width: parent.width
      height: parent.height + 6
      color: "#000000"
      bottomLeftRadius: win.bodyRadius
      bottomRightRadius: win.bodyRadius
      border.width: 1
      border.color: Qt.rgba(1, 1, 1, 0.1 * win.openness)
    }

    // Where the notch meets the screen edge it flares outward. These two
    // corners carry that flare along as the island widens.
    Shape {
      x: -win.ear
      width: win.ear + 1
      height: win.ear
      preferredRendererType: Shape.CurveRenderer

      ShapePath {
        strokeColor: "transparent"
        strokeWidth: 0
        fillColor: "#000000"
        startX: 0
        startY: 0
        PathLine { x: win.ear + 1; y: 0 }
        PathLine { x: win.ear + 1; y: win.ear }
        PathLine { x: win.ear; y: win.ear }
        PathArc { x: 0; y: 0; radiusX: win.ear; radiusY: win.ear; direction: PathArc.Counterclockwise }
      }
    }

    Shape {
      x: body.width - 1
      width: win.ear + 1
      height: win.ear
      preferredRendererType: Shape.CurveRenderer

      ShapePath {
        strokeColor: "transparent"
        strokeWidth: 0
        fillColor: "#000000"
        startX: win.ear + 1
        startY: 0
        PathLine { x: 0; y: 0 }
        PathLine { x: 0; y: win.ear }
        PathLine { x: 1; y: win.ear }
        PathArc { x: win.ear + 1; y: 0; radiusX: win.ear; radiusY: win.ear; direction: PathArc.Clockwise }
      }
    }

    Item {
      anchors.fill: parent
      clip: true

      // ------------------------------------------------------------- marks

      Mark {
        anchors.left: parent.left
        anchors.leftMargin: win.markInset
        on: win.microphoneOn
        color: win.island.microphoneColor
      }

      Mark {
        anchors.right: parent.right
        anchors.rightMargin: win.markInset
        on: win.cameraOn
        color: win.island.cameraColor
      }

      // ----------------------------------------------------------- compact

      Item {
        anchors.horizontalCenter: parent.horizontalCenter
        width: parent.width - 2 * win.inset
        height: win.notchH

        MediaCompact {
          id: mediaCompact
          anchors.fill: parent
          island: win.island
          shown: win.mode === "compact" && win.island.compactId === "media"
          peek: win.peeking
        }

        TimerCompact {
          id: timerCompact
          anchors.fill: parent
          island: win.island
          shown: win.mode === "compact" && win.island.compactId === "timer"
        }

        RecordingCompact {
          id: recordingCompact
          anchors.fill: parent
          island: win.island
          shown: win.mode === "compact" && win.island.compactId === "recording"
        }

        DictationCompact {
          id: dictationCompact
          anchors.fill: parent
          island: win.island
          shown: win.mode === "compact" && win.island.compactId === "dictation"
        }

        AgentsCompact {
          id: agentsCompact
          anchors.fill: parent
          island: win.island
          shown: win.mode === "compact" && win.island.compactId === "agents"
        }

        RemindersCompact {
          id: remindersCompact
          anchors.fill: parent
          island: win.island
          shown: win.mode === "compact" && win.island.compactId === "reminders"
        }

        ActivityCompact {
          id: activityCompact
          anchors.fill: parent
          island: win.island
          shown: win.mode === "compact" && win.island.compactId === "activities"
        }

        EventCompact {
          id: eventCompact
          anchors.fill: parent
          island: win.island
          shown: win.mode === "event"
        }

        // Calibration: a marker just outside each edge of where the island
        // takes the notch to be. Right is when both sit flush against it.
        Reveal {
          anchors.fill: parent
          shown: win.mode === "calibrate"
          restScale: 1

          Rectangle {
            x: (parent.width - win.notchW) / 2 - width
            width: 2
            height: parent.height
            color: win.island.accent
          }

          Rectangle {
            x: (parent.width + win.notchW) / 2
            width: 2
            height: parent.height
            color: win.island.accent
          }

          IslandText {
            anchors.left: parent.left
            anchors.leftMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            text: I18n.formatNumber(win.notchW)
            font.bold: true
            color: win.island.ink
            elide: Text.ElideNone
          }

          IslandText {
            anchors.right: parent.right
            anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            text: win.island.strings.t("calibrate.hint")
            font.pixelSize: Style.font.bodySmall
            color: win.island.inkSecondary
            elide: Text.ElideNone
          }
        }
      }

      // ---------------------------------------------------------- expanded
      //
      // Laid out at the open island's full width and centered, so it is
      // uncovered by the growing shape instead of reflowing with it.

      Item {
        anchors.horizontalCenter: parent.horizontalCenter
        width: win.expandedW
        height: win.pageTop + win.page.implicitHeight + win.pad

        Reveal {
          width: parent.width
          height: win.notchH
          shown: win.mode === "expanded"
          restScale: 1

          Row {
            anchors.left: parent.left
            anchors.leftMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2

            Repeater {
              model: Model.PAGES.slice(0, win.leftTabs)

              Tab {
                required property string modelData
                pageId: modelData
              }
            }
          }

          Row {
            anchors.right: parent.right
            anchors.rightMargin: 12
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2

            Repeater {
              model: Model.PAGES.slice(win.leftTabs)

              Tab {
                required property string modelData
                pageId: modelData
              }
            }
          }
        }

        Item {
          x: win.pad
          y: win.pageTop
          width: parent.width - 2 * win.pad
          height: win.page.implicitHeight

          MediaPage {
            id: mediaPage
            width: parent.width
            height: implicitHeight
            island: win.island
            shown: win.mode === "expanded" && win.island.pageId === "media"
          }

          TimerPage {
            id: timerPage
            width: parent.width
            height: implicitHeight
            island: win.island
            shown: win.mode === "expanded" && win.island.pageId === "timer"
          }

          RecordingPage {
            id: recordingPage
            width: parent.width
            height: implicitHeight
            island: win.island
            shown: win.mode === "expanded" && win.island.pageId === "recording"
          }

          RemindersPage {
            id: remindersPage
            width: parent.width
            height: implicitHeight
            island: win.island
            shown: win.mode === "expanded" && win.island.pageId === "reminders"
          }

          AgentsPage {
            id: agentsPage
            width: parent.width
            height: implicitHeight
            island: win.island
            shown: win.mode === "expanded" && win.island.pageId === "agents"
          }

          ActivitiesPage {
            id: activitiesPage
            width: parent.width
            height: implicitHeight
            island: win.island
            shown: win.mode === "expanded" && win.island.pageId === "activities"
          }
        }
      }
    }
  }
}
