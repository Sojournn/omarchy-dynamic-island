import QtQuick
import Quickshell.Services.Mpris
import "../IslandModel.js" as Model

// What is playing, from MPRIS. Everything a player reports is untrusted: text
// is bounded here and drawn as plain text, and cover art is loaded only from a
// file or HTTPS URL.
Item {
  id: root

  // How long a paused player stays live in the compact island.
  property int lingerMs: 20000
  property bool artEnabled: true

  readonly property var players: Mpris.players ? Mpris.players.values : []
  // The player last seen playing, so it is the one that stays when it pauses
  // or when two play at once.
  property string lastKey: ""
  // The player picked by hand on the music page, when there are several.
  property string chosenKey: ""
  readonly property var player: Model.pickPlayer(players, lastKey, chosenKey)

  // The players there are to switch between, by key.
  readonly property var choices: Model.playerChoices(players)
  readonly property var playingKeys: Model.playingKeys(players)
  property var previousPlaying: []

  // A pick lasts until its player goes, or another starts while it is silent.
  onPlayingKeysChanged: {
    chosenKey = Model.chosenPlayer(chosenKey, choices, previousPlaying, playingKeys)
    previousPlaying = playingKeys
  }

  function switchPlayer(delta) {
    if (choices.length > 1) chosenKey = Model.cycle(choices, Model.playerKey(player), delta)
  }

  readonly property bool available: player !== null
  readonly property bool playing: !!player && player.isPlaying === true
  property bool lingering: false
  // Between two tracks a player can report nothing at all for a moment. That
  // is not the music stopping, so the island holds on through it.
  property bool bridging: false
  readonly property bool live: (available && (playing || lingering)) || bridging

  readonly property string title: player ? Model.displayText(player.trackTitle, 160) : ""
  readonly property string artist: player ? Model.displayText(player.trackArtist, 120) : ""
  readonly property string identity: player ? Model.displayText(player.identity || player.desktopEntry, 40) : ""
  readonly property string artUrl: artEnabled && player ? Model.safeArtUrl(player.trackArtUrl) : ""

  readonly property real length: player && player.lengthSupported && player.length > 0 ? player.length : 0
  // Seconds into the track. MPRIS does not push this; a visible page asks for
  // it with syncPosition().
  property real position: 0
  readonly property bool canSeek: !!player && player.canSeek && player.positionSupported && length > 0
  readonly property bool canNext: !!player && player.canGoNext
  readonly property bool canPrevious: !!player && player.canGoPrevious
  readonly property bool canToggle: !!player && (player.canTogglePlaying || player.canPlay || player.canPause)

  readonly property string trackKey: title + "\u001f" + artist
  signal trackChanged()

  function syncPosition() {
    var seconds = player && player.positionSupported ? Math.max(0, Number(player.position) || 0) : 0
    // A player can report a position past the end of its track.
    position = length > 0 ? Math.min(seconds, length) : seconds
  }

  function toggle() {
    if (!player) return
    if (player.canTogglePlaying) player.togglePlaying()
    else if (player.isPlaying && player.canPause) player.pause()
    else if (!player.isPlaying && player.canPlay) player.play()
  }

  function next() {
    if (player && player.canGoNext) player.next()
  }

  function previous() {
    if (player && player.canGoPrevious) player.previous()
  }

  function seekTo(fraction) {
    if (!canSeek) return
    var target = Math.max(0, Math.min(1, Number(fraction) || 0)) * length
    player.position = target
    position = target
  }

  // Deferred: `player` is chosen with lastKey, so writing it from inside
  // player's own change would re-enter that binding.
  function rememberPlayer() {
    if (playing && player) lastKey = Model.playerKey(player)
  }

  onPlayerChanged: {
    Qt.callLater(root.rememberPlayer)
    syncPosition()
  }

  // Whether the music was live a moment ago. It outlasts `live` itself by a
  // beat, so the handler below can still tell when the two fall together.
  property bool recentlyLive: false

  onLiveChanged: {
    if (live) {
      recentTimer.stop()
      recentlyLive = true
    } else {
      recentTimer.restart()
    }
  }

  Timer {
    id: recentTimer
    interval: 400
    onTriggered: root.recentlyLive = false
  }

  onAvailableChanged: {
    if (available) {
      bridgeTimer.stop()
      bridging = false
    } else if (recentlyLive) {
      bridging = true
      bridgeTimer.restart()
    }
  }

  Timer {
    id: bridgeTimer
    interval: 2500
    onTriggered: root.bridging = false
  }

  onPlayingChanged: {
    if (playing) {
      lingerTimer.stop()
      lingering = false
      Qt.callLater(root.rememberPlayer)
    } else if (available && lingerMs > 0) {
      lingering = true
      lingerTimer.restart()
    } else {
      lingering = false
    }
    syncPosition()
  }

  onTrackKeyChanged: {
    syncPosition()
    if (playing && title !== "") trackChanged()
  }

  Timer {
    id: lingerTimer
    interval: Math.max(1, root.lingerMs)
    onTriggered: root.lingering = false
  }
}
