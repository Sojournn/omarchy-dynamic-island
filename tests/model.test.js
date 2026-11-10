// The island's decisions, checked without a compositor:  node --test tests/
//
// Covers what is easy to get wrong silently: durations and the timer's state,
// which activity the island shows, the notch geometry, and everything that
// takes text from outside (MPRIS, IPC, shell.json, a saved timer) and passes
// it on to be drawn or handed to another program.

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
const Model = require(path.join(root, "IslandModel.js"))

// ------------------------------------------------------------------ time

test("parseDuration reads minutes, units and clock forms", () => {
  assert.equal(Model.parseDuration("25"), 25 * 60000)
  assert.equal(Model.parseDuration("1.5"), 90000)
  assert.equal(Model.parseDuration("90s"), 90000)
  assert.equal(Model.parseDuration("25m"), 25 * 60000)
  assert.equal(Model.parseDuration("1h30m"), 90 * 60000)
  assert.equal(Model.parseDuration("1h 30m 15s"), (90 * 60 + 15) * 1000)
  assert.equal(Model.parseDuration("2 minutes"), 120000)
  assert.equal(Model.parseDuration("5:30"), 330000)
  assert.equal(Model.parseDuration("1:00:00"), 3600000)
  assert.equal(Model.parseDuration(" 10M "), 600000)
})

test("parseDuration refuses what is not a duration", () => {
  for (const bad of ["", "abc", "-5", "5x", "m5", "5m junk", "1h-30m", "0", "0s", "25h", "9999999",
    "$(id)", "5m; rm -rf ~", null, undefined, "1e9", "5:", ":30", "1:2:3:4"]) {
    assert.equal(Model.parseDuration(bad), 0, String(bad))
  }
})

test("formatClock rounds a countdown up and elapsed time down", () => {
  assert.equal(Model.formatClock(0, true), "0:00")
  assert.equal(Model.formatClock(1, true), "0:01")
  assert.equal(Model.formatClock(59001, true), "1:00")
  assert.equal(Model.formatClock(59999, false), "0:59")
  assert.equal(Model.formatClock(600000, true), "10:00")
  assert.equal(Model.formatClock(3661000, false), "1:01:01")
  assert.equal(Model.formatClock(-5, true), "0:00")
  assert.equal(Model.formatClock(NaN, false), "0:00")
})

// ----------------------------------------------------------------- timer

test("a timer runs, pauses, resumes and finishes", () => {
  let timer = Model.timerStart(60000, "Tea", 1000)
  assert.equal(timer.status, "running")
  assert.equal(timer.endAt, 61000)
  assert.equal(Model.timerRemaining(timer, 31000), 30000)
  assert.equal(Model.timerFraction(timer, 31000), 0.5)

  timer = Model.timerPause(timer, 31000)
  assert.equal(timer.status, "paused")
  assert.equal(Model.timerRemaining(timer, 999999), 30000)

  timer = Model.timerResume(timer, 100000)
  assert.equal(timer.status, "running")
  assert.equal(timer.endAt, 130000)

  assert.equal(Model.timerTick(timer, 129999), timer)
  timer = Model.timerTick(timer, 130000)
  assert.equal(timer.status, "done")
  assert.equal(timer.label, "Tea")
  assert.equal(Model.timerFraction(timer, 130000), 0)
})

test("adding time extends a timer and never finishes one", () => {
  const timer = Model.timerStart(60000, "", 0)
  const more = Model.timerAdd(timer, 60000, 30000)
  assert.equal(Model.timerRemaining(more, 30000), 90000)
  assert.equal(more.durationMs, 120000)

  const less = Model.timerAdd(timer, -10 * 60000, 30000)
  assert.equal(less.status, "running")
  assert.equal(Model.timerRemaining(less, 30000), 1000)

  const paused = Model.timerAdd(Model.timerPause(timer, 30000), 60000, 40000)
  assert.equal(paused.status, "paused")
  assert.equal(paused.remainingMs, 90000)

  assert.equal(Model.timerAdd(Model.timerIdle(), 60000, 0).status, "idle")
})

test("a timer cannot be started with nonsense", () => {
  assert.equal(Model.timerStart(0, "", 0).status, "idle")
  assert.equal(Model.timerStart(-5, "", 0).status, "idle")
  assert.equal(Model.timerStart("soon", "", 0).status, "idle")
  assert.equal(Model.timerStart(Model.MAX_TIMER_MS * 10, "", 0).durationMs, Model.MAX_TIMER_MS)
})

test("a saved timer is restored only when it still makes sense", () => {
  const now = 1000000
  const running = JSON.stringify({ status: "running", durationMs: 60000, endAt: now + 20000, label: "Tea" })
  assert.deepEqual(Model.timerRestore(running, now),
    { status: "running", durationMs: 60000, endAt: now + 20000, remainingMs: 20000, label: "Tea" })

  // Ran out while the shell was away: still rings if recent, dropped if old.
  const lapsed = JSON.stringify({ status: "running", durationMs: 60000, endAt: now - 60000, label: "" })
  assert.equal(Model.timerRestore(lapsed, now).status, "done")
  const stale = JSON.stringify({ status: "running", durationMs: 60000, endAt: now - 3600000, label: "" })
  assert.equal(Model.timerRestore(stale, now).status, "idle")

  const paused = JSON.stringify({ status: "paused", durationMs: 60000, remainingMs: 15000, label: "" })
  assert.equal(Model.timerRestore(paused, now).remainingMs, 15000)

  for (const bad of ["", "not json", "[]", "null", "42",
    JSON.stringify({ status: "running", durationMs: 60000, endAt: "tomorrow" }),
    JSON.stringify({ status: "running", durationMs: 60000, endAt: now + Model.MAX_TIMER_MS * 3 }),
    JSON.stringify({ status: "running", durationMs: -1, endAt: now + 1000 }),
    JSON.stringify({ status: "done", durationMs: 60000 }),
    JSON.stringify({ status: "exploding", durationMs: 60000 })]) {
    assert.equal(Model.timerRestore(bad, now).status, "idle", bad)
  }
})

test("a restored label is bounded like any other", () => {
  const saved = JSON.stringify({ status: "running", durationMs: 60000, endAt: 5000, label: "x".repeat(5000) })
  assert.equal(Model.timerRestore(saved, 1000).label.length, 60)
})

// ------------------------------------------------------------ activities

test("the most important live activity leads", () => {
  assert.deepEqual(Model.liveOrder({ media: true, timer: true, recording: true }), ["recording", "timer", "media"])
  assert.deepEqual(Model.liveOrder({ media: true, reminders: true, agents: true, dictation: true }),
    ["dictation", "agents", "reminders", "media"])
  assert.deepEqual(Model.liveOrder({ media: true, timer: false }), ["media"])
  assert.deepEqual(Model.liveOrder({ media: "yes" }), [])
  assert.deepEqual(Model.liveOrder(null), [])
})

test("the compact island follows what just went live", () => {
  assert.equal(Model.nextCompact("", ["media"], []), "media")
  // Music was showing; a timer starts and takes over.
  assert.equal(Model.nextCompact("media", ["timer", "media"], ["media"]), "timer")
  // Nothing new: the one picked stays, even if another outranks it.
  assert.equal(Model.nextCompact("media", ["timer", "media"], ["timer", "media"]), "media")
  // The one showing ends: the most important of the rest stands in.
  assert.equal(Model.nextCompact("timer", ["media"], ["timer", "media"]), "media")
  // Music starting, or blinking off and on between tracks, does not take the
  // island from something that matters more.
  assert.equal(Model.nextCompact("timer", ["timer", "media"], ["timer"]), "timer")
  assert.equal(Model.nextCompact("agents", ["agents", "media"], ["agents"]), "agents")
  assert.equal(Model.nextCompact("recording", ["recording", "timer", "media"], ["recording"]), "recording")
  // Something weightier than what is showing does, whatever else is new.
  assert.equal(Model.nextCompact("timer", ["recording", "timer", "media"], ["timer"]), "recording")
  assert.equal(Model.nextCompact("media", ["dictation", "agents", "media"], ["media"]), "dictation")
  assert.equal(Model.nextCompact("media", [], ["media"]), "")
})

test("cycle wraps and recovers from an unknown entry", () => {
  assert.equal(Model.cycle(Model.PAGES, "media", 1), "timer")
  assert.equal(Model.cycle(Model.PAGES, "media", -1), "activities")
  assert.equal(Model.cycle(Model.PAGES, "activities", 1), "media")
  assert.equal(Model.cycle(Model.PAGES, "nope", 1), "media")
  assert.equal(Model.cycle([], "media", 1), "")
})

// ----------------------------------------------------------------- media

test("the island follows the player that is playing", () => {
  const spotify = { dbusName: "org.mpris.MediaPlayer2.spotify", trackTitle: "A", isPlaying: false }
  const browser = { dbusName: "org.mpris.MediaPlayer2.chromium", trackTitle: "B", isPlaying: true }
  const empty = { dbusName: "org.mpris.MediaPlayer2.idle", trackTitle: "", trackArtist: "", isPlaying: true }
  const proxy = { dbusName: "org.mpris.MediaPlayer2.playerctld", trackTitle: "B", isPlaying: true }

  assert.equal(Model.pickPlayer([spotify, browser], ""), browser)
  assert.equal(Model.pickPlayer([spotify, empty], ""), spotify)
  assert.equal(Model.pickPlayer([proxy, browser], ""), browser)
  assert.equal(Model.pickPlayer([empty], ""), null)
  assert.equal(Model.pickPlayer([], ""), null)
  assert.equal(Model.pickPlayer(null, ""), null)

  // Both paused: the one last used stays.
  const paused = { dbusName: "org.mpris.MediaPlayer2.chromium", trackTitle: "B", isPlaying: false }
  assert.equal(Model.pickPlayer([spotify, paused], Model.playerKey(paused)), paused)
  assert.equal(Model.pickPlayer([spotify, paused], Model.playerKey(spotify)), spotify)
})

test("a player picked by hand is followed until another starts or it goes", () => {
  const spotify = { dbusName: "org.mpris.MediaPlayer2.spotify", trackTitle: "A", isPlaying: true }
  const browser = { dbusName: "org.mpris.MediaPlayer2.chromium", trackTitle: "B", isPlaying: false }
  const proxy = { dbusName: "org.mpris.MediaPlayer2.playerctld", trackTitle: "A", isPlaying: true }
  const empty = { dbusName: "org.mpris.MediaPlayer2.idle", trackTitle: "", trackArtist: "", isPlaying: false }
  const s = Model.playerKey(spotify)
  const b = Model.playerKey(browser)

  // The choices are the real players holding a track; a proxy only when alone.
  assert.deepEqual(Model.playerChoices([spotify, browser, proxy, empty]), [s, b])
  assert.deepEqual(Model.playerChoices([proxy]), [Model.playerKey(proxy)])
  assert.deepEqual(Model.playerChoices(null), [])
  assert.deepEqual(Model.playingKeys([spotify, browser, empty]), [s])

  // A pick outranks the player that is playing.
  assert.equal(Model.pickPlayer([spotify, browser], s, b), browser)
  assert.equal(Model.pickPlayer([spotify, browser], s, ""), spotify)
  assert.equal(Model.pickPlayer([spotify], s, b), spotify)

  // It holds while nothing new starts, and while it plays itself.
  assert.equal(Model.chosenPlayer(b, [s, b], [s], [s]), b)
  assert.equal(Model.chosenPlayer(b, [s, b], [s], []), b)
  assert.equal(Model.chosenPlayer(b, [s, b], [s], [s, b]), b)
  // Another player starting while the pick is silent takes over again.
  assert.equal(Model.chosenPlayer(b, [s, b], [], [s]), "")
  // And a pick whose player is gone is no pick.
  assert.equal(Model.chosenPlayer(b, [s], [s], [s]), "")
  assert.equal(Model.chosenPlayer("", [s, b], [], [s]), "")

  assert.equal(Model.shortLabel("Spotify", 12), "Spotify")
  assert.equal(Model.shortLabel("VLC media player", 12), "VLC media p\u2026")
  assert.equal(Model.shortLabel("a\nb", 12), "a b")
})

test("cover art loads only from a file or over https", () => {
  assert.equal(Model.safeArtUrl("file:///tmp/cover.png"), "file:///tmp/cover.png")
  assert.equal(Model.safeArtUrl("https://i.scdn.co/image/abc"), "https://i.scdn.co/image/abc")
  for (const bad of ["", null, undefined, "http://example.invalid/a.png", "ftp://example.invalid/a.png",
    "javascript:alert(1)", "data:image/png;base64,AAAA", "file://remote-host/share/a.png", "https://",
    "/tmp/cover.png", "https://example.invalid/a b.png", "https://example.invalid/\n", "qrc:/x.png",
    "image://provider/x", "https://example.invalid/" + "a".repeat(3000)]) {
    assert.equal(Model.safeArtUrl(bad), "", String(bad))
  }
})

test("equalizer levels stay in range and differ between bars", () => {
  const seen = new Set()
  for (let step = 0; step < 50; step++) {
    for (let bar = 0; bar < 5; bar++) {
      const level = Model.barLevel(bar, step)
      assert.ok(level >= 0.25 && level <= 1, `level ${level}`)
      seen.add(level.toFixed(3))
    }
  }
  assert.ok(seen.size > 100)
  assert.equal(Model.barLevel(2, 7), Model.barLevel(2, 7))
})

// ------------------------------------------------------------------ text

test("markup-shaped text is kept literal, bounded and on one line", () => {
  const hostile = '<img src="https://example.invalid/tracker"> <b>bold</b>'
  // Drawn text is left as written; the QML side draws it as plain text.
  assert.equal(Model.displayText(hostile, 200), hostile)
  assert.equal(Model.displayText("a\nb\tc\u0000d e", 50), "a b c d e")
  assert.equal(Model.displayText("x".repeat(500), 40).length, 40)
  assert.equal(Model.displayText(null, 40), "")
  assert.equal(Model.displayText(undefined, 40), "")
  assert.equal(Model.displayText(42, 40), "42")
})

// Omarchy's own renderer for notification bodies, when it is installed here:
// the real judge of whether a label stays literal. Its two files are QML
// JavaScript libraries, loaded here without their QML-only header lines.
function omarchyRender() {
  const dir = "/usr/share/omarchy/shell/plugins/notifications"
  if (!fs.existsSync(path.join(dir, "Markup.js")) || !fs.existsSync(path.join(dir, "Security.js"))) return null
  const load = (name) => fs.readFileSync(path.join(dir, name), "utf8").replace(/^\.(pragma|import).*$/gm, "")
  const Security = new Function(load("Security.js")
    + "\nreturn { MAX_BODY, bounded, safeExternalUrl, safeHttpUrl, canonicalHostname, hostOf }")()
  return new Function("Security", load("Markup.js") + "\nreturn render")(Security)
}

test("a label stays literal in a notification body", () => {
  const hostile = [
    "<b>bold</b>", "<i>x</i> <u>y</u> <s>z</s> <em>e</em> <strong>s</strong>", "line<br>break", "a<br/>b",
    '<a href="https://example.invalid/">click</a>', '<img src="https://example.invalid/tracker">',
    "&lt;b&gt;decoded&lt;/b&gt;", "&amp;lt;b&amp;gt;twice&amp;lt;/b&amp;gt;", "&#60;b&#62;numeric&#60;/b&#62;",
    "&#x3c;b&#x3e;hex&#x3c;/b&#x3e;", "Tom & Jerry <3", "<\u200bb>pre-broken</b>",
    "see https://example.invalid/page now", "http://example.invalid", "mailto:someone@example.invalid"
  ]
  const render = omarchyRender()
  for (const label of hostile) {
    const literal = Model.notificationLiteral(label)
    // Every character that could start a tag or an entity is broken off.
    assert.doesNotMatch(literal, /[<&](?!\u200b)/, label)
    // And it still reads as written.
    assert.equal(literal.replace(/\u200b/g, ""), label.replace(/\u200b/g, ""))
    if (render) {
      const drawn = render(literal)
      // Nothing styled, nothing to click, nothing loaded: no tag at all.
      assert.doesNotMatch(drawn, /<[a-z\/]/i, `${label} -> ${drawn}`)
    }
  }
  assert.equal(Model.notificationLiteral(null), "")
})

test("Omarchy's renderer does style a body that is not broken up", (t) => {
  // The control for the test above: without the break, the same text is
  // drawn as markup, so that test is checking something real.
  const render = omarchyRender()
  if (!render) return t.skip("Omarchy's notification renderer is not installed here")
  assert.match(render("<b>bold</b>"), /<b>bold<\/b>/)
  assert.match(render("&lt;b&gt;decoded&lt;/b&gt;"), /<b>decoded<\/b>/)
  assert.match(render("see https://example.invalid/page now"), /<a href="https:\/\/example\.invalid\/page">/)
})

test("a label can never be read as an option", () => {
  assert.equal(Model.plainLabel("--exec rm -rf ~"), "exec rm -rf ~")
  assert.equal(Model.plainLabel("  - -t 1"), "t 1")
  assert.equal(Model.plainLabel("\n--action\nx"), "action x")
  assert.equal(Model.plainLabel("Tea - green"), "Tea - green")
  assert.equal(Model.plainLabel("---"), "")
})

test("the timer notification is built from separate, safe arguments", () => {
  const argv = Model.timerNotification("Timer finished", '--exec sh <img src="https://example.invalid/t">')
  assert.equal(argv[0], "omarchy-notification-send")
  // Only the options this plugin wrote start with a dash.
  const dashed = argv.slice(1).filter((arg) => arg.startsWith("-"))
  assert.deepEqual(dashed, ["-g", "-u", "-t"])
  const body = argv[argv.length - 1]
  assert.doesNotMatch(body, /[<&](?!\u200b)/, body)
  assert.ok(body.startsWith("exec sh <\u200bimg"), body)

  // No label, no body; and a headline cannot smuggle an option either.
  assert.equal(Model.timerNotification("Timer finished", "").length, 8)
  assert.equal(Model.timerNotification("--exec evil", "")[7], "exec evil")
  assert.equal(Model.timerNotification("", "")[7], "Timer")
})

// -------------------------------------------------------------- settings

test("settings fall back to defaults and stay in range", () => {
  assert.deepEqual(Model.normalizeSettings(null), Model.DEFAULTS)
  assert.deepEqual(Model.normalizeSettings("nope"), Model.DEFAULTS)
  assert.deepEqual(Model.normalizeSettings([1, 2]), Model.DEFAULTS)

  const odd = Model.normalizeSettings({
    notchWidth: 99999, notchHeight: -4, expandedWidth: "wide", expandOnHover: "yes",
    hoverDelay: 1e9, mediaLinger: null, timerPresets: [0, -3, "x", 5, 5, 90, 2000, 7, 8, 9, 10, 11],
    albumArt: false, extra: "ignored"
  })
  assert.equal(odd.notchWidth, 600)
  assert.equal(odd.notchHeight, 0)
  assert.equal(odd.expandedWidth, 420)
  assert.equal(odd.expandOnHover, true)
  assert.equal(odd.hoverDelay, 2000)
  assert.equal(odd.mediaLinger, 20)
  assert.deepEqual(odd.timerPresets, [5, 90, 7, 8, 9])
  assert.equal(odd.albumArt, false)
  assert.equal(odd.extra, undefined)
  assert.deepEqual(Model.normalizeSettings({ timerPresets: [] }).timerPresets, [1, 5, 10, 25])

  // Battery levels: in range, each once, highest first; an empty list is "never".
  assert.deepEqual(Model.normalizeSettings({ batteryLow: [10, 50, 0, 200, "x", 10, 5.4] }).batteryLow, [50, 10, 5])
  assert.deepEqual(Model.normalizeSettings({ batteryLow: [] }).batteryLow, [])
  assert.deepEqual(Model.normalizeSettings({ batteryLow: "20" }).batteryLow, [20, 10])
  assert.deepEqual(Model.normalizeSettings({ batteryLow: [1, 2, 3, 4, 5, 6] }).batteryLow.length, 4)
  // Ignored programs: text only, lowercased, bounded.
  assert.deepEqual(Model.normalizeSettings({ privacyIgnore: ["EasyEffects", 3, "", "  OBS  ", "obs"] }).privacyIgnore, ["easyeffects", "obs"])
  assert.deepEqual(Model.normalizeSettings({ privacyIgnore: "obs" }).privacyIgnore, [])
  assert.equal(Model.normalizeSettings({ privacyIgnore: new Array(40).fill(0).map((_, i) => "app" + i) }).privacyIgnore.length, 16)
  assert.equal(Model.normalizeSettings({ microphone: "no", camera: false }).microphone, true)
  assert.equal(Model.normalizeSettings({ microphone: "no", camera: false }).camera, false)
})

test("the plugin finds its own entry in shell.json", () => {
  const config = JSON.stringify({
    plugins: [null, "x", { id: "someone.else", notchWidth: 1 }, { id: Model.PLUGIN_ID, notchWidth: 190 }]
  })
  assert.deepEqual(Model.pluginEntry(config, Model.PLUGIN_ID), { id: Model.PLUGIN_ID, notchWidth: 190 })
  assert.deepEqual(Model.pluginEntry(config, "missing.plugin"), {})
  assert.deepEqual(Model.pluginEntry("{ not json", Model.PLUGIN_ID), {})
  assert.deepEqual(Model.pluginEntry(JSON.stringify({ plugins: "none" }), Model.PLUGIN_ID), {})
})

test("saving one setting keeps the others", () => {
  const merged = Model.mergeEntry({ id: Model.PLUGIN_ID, mediaLinger: 5, custom: true }, { notchWidth: 188 })
  assert.deepEqual(merged, { mediaLinger: 5, custom: true, notchWidth: 188 })
  assert.deepEqual(Model.mergeEntry(null, { notchWidth: 188 }), { notchWidth: 188 })
})

// ------------------------------------------------------------- the notch

test("a notch is found only on the panel that has one", () => {
  const cutouts = Model.parseCutouts(JSON.stringify({
    panels: [
      { connector: "eDP", width: 3024, height: 1964, top: 64 },
      { connector: "eDP", width: 2560, height: 1664, top: 56 },
      { connector: "", width: 10, height: 10, top: 1 },
      { connector: "eDP", width: 100, height: 100, top: 500 },
      "junk"
    ]
  }))
  assert.equal(cutouts.length, 2)

  const mode = { width: 3024, height: 1964, transform: 0 }
  assert.equal(Model.cutoutTop(cutouts, "eDP-1", 1512, 982, 2, mode), 32)
  // Before Hyprland reports the mode, the logical size times the ratio does.
  assert.equal(Model.cutoutTop(cutouts, "eDP-1", 1512, 982, 2, null), 32)
  // A fractional scale still matches once the mode is known.
  assert.equal(Model.cutoutTop(cutouts, "eDP-1", 1890, 1227.5, 2, mode), 40)
  // An external monitor, another mode, or a rotated panel has no notch here.
  assert.equal(Model.cutoutTop(cutouts, "DP-2", 1512, 982, 2, mode), 0)
  assert.equal(Model.cutoutTop(cutouts, "eDP-1", 1920, 1080, 1, { width: 1920, height: 1080, transform: 0 }), 0)
  assert.equal(Model.cutoutTop(cutouts, "eDP-1", 982, 1512, 2, { width: 3024, height: 1964, transform: 1 }), 0)
  assert.equal(Model.cutoutTop([], "eDP-1", 1512, 982, 2, mode), 0)
  assert.deepEqual(Model.parseCutouts("not json"), [])
})

test("the notch width is guessed from its height", () => {
  assert.equal(Model.defaultNotchWidth(32), 185)
  assert.equal(Model.defaultNotchWidth(0), 0)
  assert.equal(Model.defaultNotchWidth("x"), 0)
})

test("only a real fullscreen window hides the island", () => {
  const toplevels = [
    { workspace: { id: 1 }, lastIpcObject: { fullscreen: 1 } },
    { workspace: { id: 2 }, lastIpcObject: { fullscreen: 2 } },
    { workspace: null, lastIpcObject: { fullscreen: 2 } },
    null
  ]
  assert.equal(Model.fullscreenOn(toplevels, 1), false)
  assert.equal(Model.fullscreenOn(toplevels, 2), true)
  assert.equal(Model.fullscreenOn(toplevels, 3), false)
  assert.equal(Model.fullscreenOn(null, 2), false)
})

test("theme colors are used on black only when they can be read there", () => {
  assert.equal(Model.readableOnBlack(1, 1, 1), true)
  assert.equal(Model.readableOnBlack(0.1, 0.1, 0.2), false)
  // A saturated red is dim by luminance, so warnings get a lower bar.
  assert.equal(Model.readableOnBlack(1, 0.2, 0.2), true, "bright red")
  assert.equal(Model.readableOnBlack(0.9, 0, 0, 0.18), true)
  assert.equal(Model.readableOnBlack(0.3, 0, 0, 0.18), false)
})

// ---------------------------------------------------------------- events

const event = (kind, extra) => Object.assign({ kind, glyph: "g", tone: "ink", lead: kind, trail: "", fraction: -1, duration: 1000 }, extra)

test("one event shows at a time and the rest wait their turn", () => {
  let state = Model.eventsIdle()
  const battery = event("battery")
  const bluetooth = event("bluetooth")
  const agent = event("agent")

  state = Model.eventPush(state, battery)
  assert.equal(state.current, battery)
  state = Model.eventPush(state, bluetooth)
  state = Model.eventPush(state, agent)
  assert.equal(state.current, battery)
  assert.deepEqual(state.queue, [bluetooth, agent])

  state = Model.eventNext(state)
  assert.equal(state.current, bluetooth)
  state = Model.eventNext(state)
  assert.equal(state.current, agent)
  state = Model.eventNext(state)
  assert.equal(state.current, null)
  assert.deepEqual(Model.eventNext(state), Model.eventsIdle())
})

test("a newer event of the same kind replaces the one showing or waiting", () => {
  const first = event("osd", { fraction: 0.4 })
  const second = event("osd", { fraction: 0.45 })
  let state = Model.eventPush(Model.eventsIdle(), first)
  state = Model.eventPush(state, second)
  assert.equal(state.current, second)
  assert.equal(state.queue.length, 0)

  const oldAgent = event("agent")
  const newAgent = event("agent")
  state = Model.eventPush(Model.eventPush(Model.eventsIdle(), event("battery")), oldAgent)
  state = Model.eventPush(state, newAgent)
  assert.deepEqual(state.queue, [newAgent])
})

test("the volume keys take the island at once, and the queue stays bounded", () => {
  const battery = event("battery")
  const volume = event("osd", { preempt: true })
  let state = Model.eventPush(Model.eventsIdle(), battery)
  state = Model.eventPush(state, event("bluetooth"))
  state = Model.eventPush(state, volume)
  assert.equal(state.current, volume)
  assert.equal(state.queue.length, 1)

  state = Model.eventPush(Model.eventsIdle(), battery)
  for (const kind of ["a", "b", "c", "d", "e", "f", "g"]) state = Model.eventPush(state, event(kind))
  assert.equal(state.queue.length, 4)
  assert.deepEqual(state.queue.map((queued) => queued.kind), ["d", "e", "f", "g"])

  assert.deepEqual(Model.eventPush(null, null), Model.eventsIdle())
  assert.deepEqual(Model.eventPush(Model.eventsIdle(), {}), Model.eventsIdle())
})

// ------------------------------------------------------ on-screen display

const osd = (payload) => Model.osdEvent(JSON.stringify(payload))

test("volume and brightness become a level beside the notch", () => {
  const volume = osd({ icon: "volume-high", message: "", value: "45", max: "100", progressText: "45%", duration: "" })
  assert.equal(volume.kind, "progress")
  assert.equal(volume.fraction, 0.45)
  assert.equal(volume.percent, 45)
  assert.equal(volume.glyph, Model.glyphs.volumeMedium)
  assert.equal(volume.duration, 1400)

  assert.equal(osd({ icon: "volume-high", value: "90" }).glyph, Model.glyphs.volumeHigh)
  assert.equal(osd({ icon: "volume-high", value: "10" }).glyph, Model.glyphs.volumeLow)
  assert.equal(osd({ icon: "volume-high", value: "0" }).glyph, Model.glyphs.volumeOff)
  assert.equal(osd({ icon: "volume-muted", value: "60" }).glyph, Model.glyphs.volumeOff)
  assert.equal(osd({ icon: "brightness", value: "80" }).glyph, Model.glyphs.brightness)
  assert.equal(osd({ icon: "keyboard", value: "2", max: "3" }).percent, 67)

  // Out of range stays in range, and a duration is neither a blink nor a stay.
  assert.equal(osd({ icon: "volume", value: "250" }).fraction, 1)
  assert.equal(osd({ icon: "volume", value: "-5" }).fraction, 0)
  assert.equal(osd({ icon: "volume", value: "5", duration: "1" }).duration, 500)
  assert.equal(osd({ icon: "volume", value: "5", duration: "999999" }).duration, 6000)
})

test("what does not fit beside the notch is left to the on-screen display", () => {
  assert.equal(osd({ icon: "brightness", message: "Night light on" }).kind, "message")
  assert.equal(osd({ icon: "brightness", message: "Night light on" }).text, "Night light on")
  assert.equal(osd({ icon: "", message: "x".repeat(29) }).kind, "none")
  assert.equal(osd({ icon: "media-next", message: "Song - Artist" }).kind, "media")
  assert.equal(osd({ icon: "player", value: "3" }).kind, "media")
  // A level with a glyph the island does not know.
  assert.equal(osd({ icon: "mystery", value: "40" }).kind, "none")
  assert.equal(osd({ icon: "volume" }).kind, "none")
  assert.equal(osd({}).kind, "none")
  for (const bad of ["", "not json", "[]", "null", "42", '"text"', JSON.stringify({ icon: "volume", value: "5", pad: "x".repeat(9000) })]) {
    assert.equal(Model.osdEvent(bad).kind, "none", bad.slice(0, 20))
  }
  assert.equal(Model.osdEvent(null).kind, "none")
})

test("an on-screen display message is kept literal and on one line", () => {
  const message = osd({ icon: "brightness", message: "<b>hi</b>\n<img src=x>" })
  assert.equal(message.text, "<b>hi</b> <img src=x>")
})

// ---------------------------------------------------------------- battery

test("the battery announces the charger and a finished charge, once each", () => {
  const reading = (onBattery, full, percent) => ({ present: true, onBattery, full, percent })
  assert.deepEqual(Model.batteryEvents(reading(true, false, 54), reading(false, false, 54)), ["plugged"])
  assert.deepEqual(Model.batteryEvents(reading(false, false, 54), reading(true, false, 54)), ["unplugged"])
  assert.deepEqual(Model.batteryEvents(reading(false, false, 99), reading(false, true, 100)), ["charged"])
  // Plugged in already full: one event, not two.
  assert.deepEqual(Model.batteryEvents(reading(true, false, 100), reading(false, true, 100)), ["plugged"])
  // Nothing changed, a level tick, or still full.
  assert.deepEqual(Model.batteryEvents(reading(false, false, 54), reading(false, false, 55)), [])
  assert.deepEqual(Model.batteryEvents(reading(false, true, 100), reading(false, true, 100)), [])
  // A machine with no battery, or a first reading.
  assert.deepEqual(Model.batteryEvents({ present: false, onBattery: false }, reading(true, false, 50)), [])
  assert.deepEqual(Model.batteryEvents(null, reading(true, false, 50)), [])
})

test("a draining battery warns once at each level it passes", () => {
  const draining = (percent) => ({ present: true, onBattery: true, full: false, percent })
  const charging = (percent) => ({ present: true, onBattery: false, full: false, percent })
  const levels = [20, 10]
  assert.deepEqual(Model.batteryEvents(draining(21), draining(20), levels), ["low"])
  assert.deepEqual(Model.batteryEvents(draining(20), draining(19), levels), [])
  assert.deepEqual(Model.batteryEvents(draining(11), draining(10), levels), ["low"])
  // Waking from sleep well below both: still one warning.
  assert.deepEqual(Model.batteryEvents(draining(40), draining(5), levels), ["low"])
  // Not while charging, not on the way up, not with the warning off.
  assert.deepEqual(Model.batteryEvents(charging(21), charging(20), levels), [])
  assert.deepEqual(Model.batteryEvents(draining(19), draining(21), levels), [])
  assert.deepEqual(Model.batteryEvents(draining(21), draining(20), []), [])
  assert.deepEqual(Model.batteryEvents(draining(21), draining(20)), [])
  // Unplugging at a low level is the unplugging; the next level down still warns.
  assert.deepEqual(Model.batteryEvents(charging(15), draining(15), levels), ["unplugged"])
  // A reading with no level is not a level passed.
  assert.deepEqual(Model.batteryEvents(draining(-1), draining(5), levels), [])
})

// ---------------------------------------------------------------- privacy

test("a program recording from the microphone counts; the plumbing does not", () => {
  // The hints a MacBook's platform package ships.
  const hints = Model.parseAudioHints(JSON.stringify({
    hidden: ["audio_effect\\.j[0-9]+-mic", "input\\.omarchy_asahi_mic", "(broken", 7],
    replaced: [{ node: "effect_output\\.j[0-9]+-mic", by: "omarchy_asahi_mic" }, { node: "x" }, null]
  }))
  assert.equal(hints.hidden.length, 2)
  assert.equal(hints.replaced.length, 1)
  assert.equal(Model.audioHidden("audio_effect.j414-mic", hints, []), true)
  // A whole name, not a part of one.
  assert.equal(Model.audioHidden("my-audio_effect.j414-mic-app", hints, []), false)
  assert.equal(Model.audioHidden("effect_output.j414-mic", hints, ["omarchy_asahi_mic"]), true)
  assert.equal(Model.audioHidden("effect_output.j414-mic", hints, ["something_else"]), false)
  assert.equal(Model.audioHidden("firefox", hints, []), false)
  for (const bad of ["", "nope", "[]", "null", '{"hidden": "x"}']) {
    assert.deepEqual(Model.parseAudioHints(bad), { hidden: [], replaced: [] })
  }

  const streams = [
    { name: "audio_effect.j414-mic" },
    { name: "input.omarchy_asahi_mic" },
    { name: "Firefox", app: "Firefox", binary: "firefox" },
    { name: "parecord", app: "parecord", captureSink: true },
    { name: "cava", app: "cava", fromSink: true },
    { name: "capture.rnnoise", linked: true },
    { name: "x", app: "PulseAudio Volume Control", media: "Peak detect" },
    { name: "quickshell-peak-monitor" },
    { name: "Chromium input", app: "Chromium input" }
  ]
  const names = streams.map((stream) => stream.name)
  assert.deepEqual(Model.microphoneApps(streams, hints, names, []), ["Firefox", "Chromium"])
  assert.deepEqual(Model.microphoneApps(streams, hints, names, ["firefox"]), ["Chromium"])
  // Without the platform's hints its always-on streams would count, nameless.
  assert.deepEqual(Model.microphoneApps(streams.slice(0, 2), Model.parseAudioHints(""), names, []), [""])
  // A program that gives no name still counts: something is listening.
  assert.deepEqual(Model.microphoneApps([{ name: "alsa_capture.something" }], hints, [], []), [""])
  assert.deepEqual(Model.microphoneApps(null, hints, [], []), [])
  assert.equal(Model.firstLabel(["", "Zoom"]), "Zoom")
  assert.equal(Model.firstLabel([""]), "")
  assert.equal(Model.firstLabel(null), "")
})

test("the camera's holders are named, and PipeWire stands for whoever is behind it", () => {
  assert.deepEqual(Model.cameraHolders("firefox\tpipewire\tfirefox"), ["firefox", "pipewire"])
  assert.deepEqual(Model.cameraHolders(""), [])
  assert.deepEqual(Model.cameraHolders(null), [])
  assert.deepEqual(Model.cameraHolders("a\u0007b\t" + "x".repeat(200)), ["a b", "x".repeat(40)])
  assert.equal(Model.cameraHolders(new Array(50).fill(0).map((_, i) => "p" + i).join("\t")).length, 8)

  assert.deepEqual(Model.cameraApps(["ffmpeg", "obs"], [], []), ["FFmpeg", "OBS"])
  assert.deepEqual(Model.cameraApps(["ffmpeg", "obs"], [], ["obs"]), ["FFmpeg"])
  assert.deepEqual(Model.cameraApps(["pipewire"], ["Firefox"], []), ["Firefox"])
  // PipeWire holding the camera for nobody it can name is still the camera in use.
  assert.deepEqual(Model.cameraApps(["pipewire"], [], []), [""])
  assert.deepEqual(Model.cameraApps(["pipewire"], ["Firefox"], ["firefox"]), [""])
  assert.deepEqual(Model.cameraApps([], ["Firefox"], []), [])
  assert.deepEqual(Model.cameraApps(null, null, null), [])
})

test("a program is called what people call it", () => {
  assert.equal(Model.appLabel("firefox"), "Firefox")
  assert.equal(Model.appLabel("Chromium input"), "Chromium")
  assert.equal(Model.appLabel("Google Chrome input"), "Chrome")
  assert.equal(Model.appLabel("/usr/bin/obs"), "OBS")
  assert.equal(Model.appLabel("gpu-screen-reco"), "Screen recorder")
  assert.equal(Model.appLabel("ALSA plug-in [superwhisper]"), "Superwhisper")
  assert.equal(Model.appLabel("pw-record"), "pw-record")
  assert.equal(Model.appLabel("Zoom Workplace"), "Zoom Workplace")
  // Whatever a program calls itself, it is one bounded line of plain text.
  assert.equal(Model.appLabel("<b>evil</b>\nsecond line that goes on and on"), "<b>evil</b> second line")
  assert.equal(Model.appLabel("A/B Tester"), "A/B Tester")
  assert.equal(Model.appLabel(""), "")
  assert.equal(Model.appLabel(null), "")
})

test("the camera watcher answers once and exits", (t) => {
  const { spawnSync } = require("node:child_process")
  const script = path.join(root, "bin", "island-camera-watch")
  assert.equal(spawnSync("bash", ["-n", script]).status, 0)
  if (spawnSync("bash", ["-c", "command -v udevadm && command -v find"]).status !== 0) return t.skip("no udevadm or find here")
  const run = spawnSync(script, ["--once"], { encoding: "utf8", timeout: 10000 })
  assert.equal(run.status, 0, run.stderr)
  // One line: the holders' names, or nothing when no camera is in use.
  assert.equal(run.stdout.split("\n").length, 2)
  assert.doesNotMatch(run.stdout, /[\u0000-\u0008]/)
})

// -------------------------------------------------------------- dictation

test("Superwhisper's tray frames say what it is doing", () => {
  assert.equal(Model.frameName("image://icon//opt/superwhisper/icons/IconRecording-recording-dark.svg"), "IconRecording")
  assert.equal(Model.frameName("IconWorking-dark"), "IconWorking")
  assert.equal(Model.frameName(""), "")
  assert.equal(Model.frameName(null), "")
  assert.equal(Model.dictationPhase("IconRecording"), "recording")
  assert.equal(Model.dictationPhase("IconWorking"), "working")
  assert.equal(Model.dictationPhase("IconComplete"), "complete")
  assert.equal(Model.dictationPhase("IconReady3"), "")
  assert.equal(Model.dictationPhase("IconLoading"), "")
})

// -------------------------------------------------------------- reminders

test("reminders are read from omarchy-reminder's listing, soonest first", () => {
  const listing = JSON.stringify({
    count: 3,
    reminders: [
      { unit: "omarchy-reminder-30m-1794290000", label: "Check the oven", at: 1794291800 },
      { unit: "omarchy-reminder-5m-1794290100", label: "5 minute reminder", at: 1794290400 },
      { unit: "evil; rm -rf ~", label: "nope", at: 1794290400 },
      { unit: "omarchy-reminder-9m-1794290200", label: "no time", at: "soon" },
      { unit: "omarchy-reminder-9m-1794290300", label: "<b>bold</b>\n" + "x".repeat(200), at: 1794299999 },
      null
    ]
  })
  const reminders = Model.parseReminders(listing)
  assert.deepEqual(reminders.map((reminder) => reminder.unit),
    ["omarchy-reminder-5m-1794290100", "omarchy-reminder-30m-1794290000", "omarchy-reminder-9m-1794290300"])
  assert.equal(reminders[0].at, 1794290400000)
  assert.equal(reminders[2].label.length, 80)
  assert.ok(reminders[2].label.startsWith("<b>bold</b> x"))

  assert.deepEqual(Model.parseReminders("not json"), [])
  assert.deepEqual(Model.parseReminders(JSON.stringify({ reminders: "none" })), [])
  assert.deepEqual(Model.parseReminders(""), [])
  const many = { reminders: Array.from({ length: 40 }, (_, i) => ({ unit: `omarchy-reminder-1m-${1000 + i}`, label: "x", at: 2000 + i })) }
  assert.equal(Model.parseReminders(JSON.stringify(many)).length, 12)
})

test("a reminder that left the list on time fired; one cleared early did not", () => {
  const due = { unit: "omarchy-reminder-5m-1", label: "Due", at: 100000 }
  const later = { unit: "omarchy-reminder-9m-2", label: "Later", at: 900000 }
  assert.deepEqual(Model.remindersFired([due, later], [later], 100500), [due])
  // Both cleared while one was still far off.
  assert.deepEqual(Model.remindersFired([due, later], [], 100500), [due])
  assert.deepEqual(Model.remindersFired([later], [], 100500), [])
  assert.deepEqual(Model.remindersFired([due], [due], 100500), [])
  assert.deepEqual(Model.remindersFired(null, [later], 1), [])
})

// ----------------------------------------------------------------- agents

const report = (payload) => Model.agentPayload(JSON.stringify(payload))

test("an agent's report is validated and bounded", () => {
  const ok = report({ state: "input", agent: "Claude", window: "0xAAAAD9303260", project: "Work", detail: "Claude needs your permission", session: "abc" })
  assert.equal(ok.ok, true)
  assert.equal(ok.agent, "claude")
  assert.equal(ok.window, "aaaad9303260")
  assert.equal(ok.key, "window:aaaad9303260")

  // No window: the agent and its session stand in for it.
  assert.equal(report({ state: "done", agent: "codex", session: "s1", project: "p" }).key, "agent:codex:s1")
  assert.equal(report({ state: "done", agent: "codex", project: "p" }).key, "agent:codex:p")
  // An address that is not one is dropped rather than trusted.
  assert.equal(report({ state: "done", agent: "codex", window: '0x1" }) os.execute("id") --' }).window, "")

  for (const bad of [
    { state: "exploding", agent: "claude" }, { state: "done", agent: "" }, { state: "done", agent: "../etc" },
    { state: "done", agent: "has space" }, { state: "done" }, { agent: "claude" }
  ]) assert.equal(report(bad).ok, false, JSON.stringify(bad))
  for (const bad of ["", "nope", "[]", "null", JSON.stringify({ state: "done", agent: "a", pad: "x".repeat(9000) })])
    assert.equal(Model.agentPayload(bad).ok, false)

  const long = report({ state: "done", agent: "claude", project: "p".repeat(500), detail: "<b>d</b>\n".repeat(100) })
  assert.equal(long.project.length, 40)
  assert.ok(long.detail.length <= 120)
  assert.ok(!long.detail.includes("\n"))
})

test("agents wait in the island until they are looked at or get going again", () => {
  const input = report({ state: "input", agent: "claude", window: "0xaaaa1111", project: "Work" })
  let result = Model.agentsApply([], input, "", 1000)
  assert.equal(result.sessions.length, 1)
  assert.equal(result.announce, result.sessions[0])
  assert.equal(result.sessions[0].state, "input")

  // The same agent finishing replaces its entry instead of adding one.
  const done = report({ state: "done", agent: "claude", window: "0xaaaa1111", project: "Work" })
  result = Model.agentsApply(result.sessions, done, "", 2000)
  assert.equal(result.sessions.length, 1)
  assert.equal(result.sessions[0].state, "done")
  assert.deepEqual(Model.agentsSummary(result.sessions), { input: 0, done: 1 })
  // Having finished, it is still listed but no longer holds the island.
  assert.equal(Model.agentsLive(result.sessions), false)

  // Reported while its window has the focus: nothing to announce or keep.
  result = Model.agentsApply(result.sessions, input, "0xAAAA1111", 3000)
  assert.equal(result.sessions.length, 0)
  assert.equal(result.announce, null)

  // Working again, or ended, clears it.
  let sessions = Model.agentsApply([], input, "", 1000).sessions
  assert.equal(Model.agentsApply(sessions, report({ state: "working", agent: "claude", window: "0xaaaa1111" }), "", 2000).sessions.length, 0)
  assert.equal(Model.agentsApply(sessions, report({ state: "end", agent: "claude", window: "0xaaaa1111" }), "", 2000).sessions.length, 0)

  // Focusing its window answers it; focusing another does not.
  assert.equal(Model.agentsFocus(sessions, "0xbbbb2222").length, 1)
  assert.equal(Model.agentsFocus(sessions, "aaaa1111").length, 0)
  assert.equal(Model.agentsFocus(sessions, "").length, 1)
  assert.equal(Model.agentsFocus(sessions, "not an address").length, 1)
})

test("only an agent waiting on the user holds the compact island", () => {
  const waiting = Model.agentsApply([], report({ state: "input", agent: "claude", session: "w" }), "", 0).sessions
  const finished = Model.agentsApply([], report({ state: "done", agent: "codex", session: "f" }), "", 0).sessions
  assert.equal(Model.agentsLive(waiting), true)
  assert.equal(Model.agentsLive(finished), false)
  assert.equal(Model.agentsLive(waiting.concat(finished)), true)
  assert.equal(Model.agentsLive([]), false)
  assert.equal(Model.agentsLive(null), false)
  // A finished agent is announced all the same, so its event still shows.
  assert.ok(Model.agentsApply([], report({ state: "done", agent: "codex", session: "f" }), "", 0).announce)
})

test("old reports expire and the list stays short", () => {
  let sessions = []
  for (let i = 0; i < 10; i++)
    sessions = Model.agentsApply(sessions, report({ state: "done", agent: "claude", session: "s" + i }), "", i).sessions
  assert.equal(sessions.length, 6)
  assert.equal(sessions[0].key, "agent:claude:s9")

  const waiting = Model.agentsApply([], report({ state: "input", agent: "claude", session: "w" }), "", 0).sessions[0]
  const finished = Model.agentsApply([], report({ state: "done", agent: "claude", session: "f" }), "", 0).sessions[0]
  const hour = 3600000
  assert.deepEqual(Model.agentsExpire([waiting, finished], hour / 4), [waiting, finished])
  assert.deepEqual(Model.agentsExpire([waiting, finished], hour), [waiting])
  assert.deepEqual(Model.agentsExpire([waiting, finished], 5 * hour), [])
})

test("an agent is named for people, and its window focused without a shell", () => {
  assert.equal(Model.agentName("claude"), "Claude")
  assert.equal(Model.agentName("opencode"), "OpenCode")
  assert.equal(Model.agentName("aider"), "Aider")
  assert.equal(Model.agentName(""), "")

  assert.deepEqual(Model.focusWindowCommand("0xAAAAD9303260"),
    ["hyprctl", "dispatch", 'hl.dsp.focus({ window = "address:0xaaaad9303260" })'])
  for (const bad of ["", null, "zzzz", '1234" }) os.execute("id") --', "0x12", "1234; reboot"])
    assert.deepEqual(Model.focusWindowCommand(bad), [], String(bad))
})

// ------------------------------------------------------------ integration

const notify = (payload) => Model.notifyEvent(JSON.stringify(payload))
const activity = (payload) => Model.activityPayload(JSON.stringify(payload))

test("a program's notification becomes a bounded event", () => {
  const plain = notify({ title: "Build finished", text: "2m 14s", icon: "check", tone: "accent" })
  assert.equal(plain.ok, true)
  assert.deepEqual(plain.event, {
    kind: "notify:Build finished", glyph: Model.icons.check, tone: "accent",
    lead: "Build finished", trail: "2m 14s", fraction: -1, duration: 4000
  })

  // Defaults: a bell, no tone; text alone is enough.
  const bare = notify({ text: "Deployed" })
  assert.equal(bare.event.glyph, Model.icons.bell)
  assert.equal(bare.event.tone, "ink")
  assert.equal(bare.event.kind, "notify:Deployed")

  // A level takes the place of the text; an id decides what replaces what.
  const level = notify({ id: "sync", title: "Syncing", text: "hidden", progress: 30 })
  assert.equal(level.event.fraction, 0.3)
  assert.equal(level.event.trail, "")
  assert.equal(level.event.kind, "notify:sync")
  assert.equal(notify({ title: "x", progress: 250 }).event.fraction, 1)
  assert.equal(notify({ title: "x", progress: "soon" }).event.fraction, -1)

  // Neither a blink nor a stay.
  assert.equal(notify({ title: "x", duration: 1 }).event.duration, 1500)
  assert.equal(notify({ title: "x", duration: 9e9 }).event.duration, 10000)

  // Whatever it carries is cut to size and kept on one line.
  const long = notify({ title: "t".repeat(500), text: "<b>x</b>\n" + "y".repeat(500), tone: "rainbow", icon: "no-such-icon" })
  assert.equal(long.event.lead.length, 48)
  assert.equal(long.event.trail.length, 40)
  assert.ok(long.event.trail.startsWith("<b>x</b> y"))
  assert.equal(long.event.tone, "ink")
  assert.equal(long.event.glyph, Model.icons.bell)

  for (const bad of [{}, { title: "" }, { title: "   ", text: "\n" }, { icon: "check" }])
    assert.equal(notify(bad).ok, false, JSON.stringify(bad))
  for (const bad of ["", "nope", "[]", "null", "7", JSON.stringify({ title: "x", pad: "p".repeat(9000) })])
    assert.equal(Model.notifyEvent(bad).ok, false)
})

test("an icon is a known name or a single symbol, never a word or a control", () => {
  assert.equal(Model.iconGlyph("rocket"), Model.icons.rocket)
  assert.equal(Model.iconGlyph("  Rocket "), Model.icons.rocket)
  // A glyph of the caller's own, such as a Nerd Font one or an emoji.
  assert.equal(Model.iconGlyph("\u{F0493}"), "\u{F0493}")
  assert.equal(Model.iconGlyph("\u{1F680}"), "\u{1F680}")
  assert.equal(Model.iconGlyph("✓"), "✓")
  for (const bad of ["", null, undefined, "x", "ab", "no-such-icon", "<b>", "​", "‮", " ", "﻿", "️",
    "\u{1F680}\u{1F680}", "constructor", "toString", "__proto__"]) {
    assert.equal(Model.iconGlyph(bad), "", JSON.stringify(bad))
    assert.equal(Model.iconGlyph(bad, "?"), "?")
  }
  // Every name is a single glyph, and the names are plain words.
  for (const [name, glyph] of Object.entries(Model.icons)) {
    assert.match(name, /^[a-z]+$/)
    assert.equal(Array.from(glyph).length, 1, name)
  }
  assert.equal(Model.toneName("URGENT"), "urgent")
  assert.equal(Model.toneName("accent"), "accent")
  assert.equal(Model.toneName("muted"), "muted")
  assert.equal(Model.toneName("nope"), "ink")
  assert.equal(Model.toneName(null), "ink")
})

test("an activity's report is validated, and names only what it changes", () => {
  const start = activity({ id: "build:api", state: "start", title: "Building", icon: "build", progress: 10, window: "0xAAAA1111", ttl: 30 })
  assert.equal(start.ok, true)
  assert.deepEqual(start.changes, { title: "Building", glyph: Model.icons.build, fraction: 0.1, window: "aaaa1111", ttl: 30 })

  // state defaults to start; an update names only the fields it carries.
  assert.equal(activity({ id: "a", title: "A" }).state, "start")
  assert.deepEqual(activity({ id: "a", state: "update", progress: 55 }).changes, { fraction: 0.55 })
  assert.deepEqual(activity({ id: "a", state: "update", text: "" }).changes, { text: "" })
  assert.deepEqual(activity({ id: "a", state: "end" }).changes, {})

  // Bounds.
  assert.equal(activity({ id: "a", title: "t".repeat(99) }).changes.title.length, 40)
  assert.equal(activity({ id: "a", title: "A", ttl: 1 }).changes.ttl, 5)
  assert.equal(activity({ id: "a", title: "A", ttl: 9e9 }).changes.ttl, 86400)
  assert.equal(activity({ id: "a", title: "A", window: "not an address" }).changes.window, "")
  assert.equal(activity({ id: "a", title: "A", progress: null }).changes.fraction, -1)

  for (const bad of [
    { title: "no id" }, { id: "", title: "A" }, { id: "has space", title: "A" }, { id: "../x", title: "A" },
    { id: "x".repeat(65), title: "A" }, { id: "a", state: "pause" }, { id: "a", state: "start" }, { id: "a", title: "  " }
  ]) assert.equal(activity(bad).ok, false, JSON.stringify(bad))
  assert.equal(Model.activityPayload("not json").ok, false)
})

test("activities are kept newest first until ended, updated or gone quiet", () => {
  let list = []
  let step = Model.activitiesApply(list, activity({ id: "build", title: "Building", ttl: 60 }), 1000)
  assert.equal(step.result, "ok")
  list = step.list
  assert.deepEqual(list[0], {
    id: "build", title: "Building", text: "", glyph: Model.icons.pulse, tone: "ink", fraction: -1,
    window: "", ttl: 60, startedAt: 1000, at: 1000, expiresAt: 61000
  })

  list = Model.activitiesApply(list, activity({ id: "sync", title: "Syncing" }), 2000).list
  assert.deepEqual(list.map((item) => item.id), ["sync", "build"])

  // An update changes what it names, keeps the rest, and brings it to the front.
  step = Model.activitiesApply(list, activity({ id: "build", state: "update", progress: 50, text: "linking" }), 30000)
  list = step.list
  assert.deepEqual(list.map((item) => item.id), ["build", "sync"])
  assert.equal(list[0].title, "Building")
  assert.equal(list[0].fraction, 0.5)
  assert.equal(list[0].text, "linking")
  assert.equal(list[0].startedAt, 1000)
  assert.equal(list[0].expiresAt, 90000)

  // An update or an end for something unknown says so, and creates nothing.
  step = Model.activitiesApply(list, activity({ id: "ghost", state: "update", progress: 5 }), 31000)
  assert.equal(step.result, "unknown")
  assert.equal(step.list.length, 2)
  assert.equal(Model.activitiesApply(list, activity({ id: "ghost", state: "end" }), 31000).result, "unknown")

  // Starting again resets it; ending removes it.
  list = Model.activitiesApply(list, activity({ id: "build", title: "Rebuilding" }), 40000).list
  assert.equal(list[0].fraction, -1)
  assert.equal(list[0].startedAt, 40000)
  step = Model.activitiesApply(list, activity({ id: "build", state: "end" }), 41000)
  assert.equal(step.result, "ok")
  assert.deepEqual(step.list.map((item) => item.id), ["sync"])

  // One that goes quiet is dropped when its time is up.
  assert.equal(Model.activitiesExpire(step.list, 2000 + 600000 - 1).length, 1)
  assert.equal(Model.activitiesExpire(step.list, 2000 + 600000).length, 0)

  // The list is bounded, oldest out first.
  let many = []
  for (let i = 0; i < 12; i++) many = Model.activitiesApply(many, activity({ id: "a" + i, title: "A" }), i).list
  assert.equal(many.length, Model.MAX_ACTIVITIES)
  assert.equal(many[0].id, "a11")
  assert.equal(many[many.length - 1].id, "a4")
})

test("an activity whose window closes goes with it", () => {
  const list = Model.activitiesApply(
    Model.activitiesApply([], activity({ id: "here", title: "A", window: "0xaaaa1111" }), 0).list,
    activity({ id: "anywhere", title: "B" }), 1).list
  assert.deepEqual(Model.activitiesForget(list, "aaaa1111").map((item) => item.id), ["anywhere"])
  assert.equal(Model.activitiesForget(list, "0xbbbb2222").length, 2)
  // An activity with no window is never taken for the one that closed.
  assert.equal(Model.activitiesForget(list, "").length, 2)
})

test("an activity reads as its progress, else its text, else its age", () => {
  const item = (extra) => Object.assign({ fraction: -1, text: "", startedAt: 1000 }, extra)
  assert.equal(Model.activityReadout(item({ fraction: 0.42, text: "ignored" }), 5000), "42%")
  assert.equal(Model.activityReadout(item({ fraction: 0.42 }), 5000, (percent) => `<${percent}>`), "<42>")
  assert.equal(Model.activityReadout(item({ text: "linking" }), 5000), "linking")
  assert.equal(Model.activityReadout(item({}), 66000), "1:05")
  assert.equal(Model.activityReadout(null, 5000), "")
})

// ---------------------------------------------------------- the island CLI

// bin/island with a stand-in omarchy-shell that records what it was sent and
// answers as the island would.
function runIsland(args, answer, options) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "island-cli-"))
  const sent = path.join(dir, "sent")
  const body = answer === null
    ? `#!/bin/bash\necho "Target not found."\nexit 1\n`
    : `#!/bin/bash\nprintf '%s\\n' "$@" > "${sent}"\nprintf '%s\\n' ${JSON.stringify(answer)}\n`
  fs.writeFileSync(path.join(dir, "omarchy-shell"), body, { mode: 0o755 })
  fs.writeFileSync(path.join(dir, "hyprctl"),
    `#!/bin/bash\ncat <<'JSON'\n${JSON.stringify((options && options.clients) || [])}\nJSON\n`, { mode: 0o755 })
  const result = spawnSync(path.join(root, "bin", "island"), args, {
    input: "", env: Object.assign({}, process.env, { PATH: dir + ":" + process.env.PATH }), encoding: "utf8"
  })
  const lines = fs.existsSync(sent) ? fs.readFileSync(sent, "utf8").replace(/\n$/, "").split("\n") : null
  fs.rmSync(dir, { recursive: true, force: true })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, lines, payload: lines && lines[2] ? JSON.parse(lines[2]) : null }
}

test("island notify sends one bounded payload and reports whether it landed", () => {
  let run = runIsland(["notify", "Build finished", "2m 14s", "--icon", "check", "--tone", "accent", "--duration", "6000"], "shown")
  assert.equal(run.status, 0)
  assert.equal(run.stdout, "")
  assert.deepEqual(run.lines.slice(0, 2), ["island", "notify"])
  assert.deepEqual(run.payload, { title: "Build finished", text: "2m 14s", icon: "check", tone: "accent", duration: 6000 })
  assert.equal(Model.notifyEvent(run.lines[2]).ok, true)

  run = runIsland(["notify", "Syncing", "--progress", "42", "--id", "sync"], "shown")
  assert.deepEqual(run.payload, { title: "Syncing", id: "sync", progress: 42 })

  // Text that looks like options or code stays text.
  run = runIsland(["notify", "--", '--icon "$(id)"', "`uname` <b>x</b>"], "shown")
  assert.deepEqual(run.payload, { title: '--icon "$(id)"', text: "`uname` <b>x</b>" })

  // Not shown, not running, not understood: each has its own answer.
  assert.equal(runIsland(["notify", "x"], "declined").status, 1)
  assert.equal(runIsland(["notify", "x"], "off").status, 1)
  assert.equal(runIsland(["notify", "x"], null).status, 1)
  run = runIsland(["notify", "x"], "invalid: needs a title or text")
  assert.equal(run.status, 2)
  assert.match(run.stderr, /needs a title or text/)
  for (const bad of [["notify"], ["notify", "a", "b", "c"], ["notify", "x", "--progress", "lots"], ["notify", "x", "--nope"], ["notify", "x", "--icon"], ["fly"], []])
    assert.equal(runIsland(bad, "shown").status, 2, bad.join(" "))
})

test("island activity starts, updates and ends by id", () => {
  let run = runIsland(["activity", "start", "build:api", "Building", "compiling", "--icon", "build", "--progress", "10", "--ttl", "120"], "ok")
  assert.equal(run.status, 0)
  assert.deepEqual(run.lines.slice(0, 2), ["island", "activity"])
  assert.deepEqual(run.payload, { id: "build:api", state: "start", title: "Building", text: "compiling", icon: "build", progress: 10, ttl: 120 })
  assert.equal(Model.activityPayload(run.lines[2]).ok, true)

  // An update carries only what was asked for; an empty --text clears it.
  run = runIsland(["activity", "update", "build:api", "--progress", "60"], "ok")
  assert.deepEqual(run.payload, { id: "build:api", state: "update", progress: 60 })
  run = runIsland(["activity", "update", "build:api", "--text", ""], "ok")
  assert.deepEqual(run.payload, { id: "build:api", state: "update", text: "" })
  run = runIsland(["activity", "end", "build:api"], "ok")
  assert.deepEqual(run.payload, { id: "build:api", state: "end" })

  // --window auto names the terminal this runs in (here, the test process).
  run = runIsland(["activity", "start", "a", "A", "--window", "auto"], "ok", { clients: [{ pid: process.pid, address: "0xaaaa1111" }] })
  assert.equal(run.payload.window, "0xaaaa1111")
  run = runIsland(["activity", "start", "a", "A", "--window", "auto"], "ok", { clients: [] })
  assert.equal(run.payload.window, "")
  run = runIsland(["activity", "start", "a", "A"], "ok")
  assert.ok(!("window" in run.payload))

  assert.equal(runIsland(["activity", "update", "ghost", "--progress", "5"], "unknown").status, 1)
  assert.equal(runIsland(["activity", "end", "a"], null).status, 1)
  for (const bad of [["activity"], ["activity", "pause", "a"], ["activity", "start", "a"], ["activity", "update"], ["activity", "update", "a", "extra"], ["activity", "end"]])
    assert.equal(runIsland(bad, "ok").status, 2, bad.join(" "))
})

test("island answers the small questions", () => {
  assert.equal(runIsland(["ping"], "ok").status, 0)
  assert.equal(runIsland(["ping"], null).status, 1)
  assert.equal(runIsland(["icons"], "check rocket build").stdout, "check\nrocket\nbuild\n")
  assert.equal(runIsland(["icons"], null).status, 1)
  const help = runIsland(["--help"], "ok")
  assert.equal(help.status, 0)
  assert.match(help.stdout, /island notify <title>/)
})

// ------------------------------------------------- the agent hook script

// bin/island-agent, run with stand-ins for hyprctl and omarchy-shell on its
// PATH, so what it would send can be read back.
const { spawnSync } = require("node:child_process")
const os = require("node:os")

function runAgentHook(args, stdin, clients) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "island-agent-"))
  const sent = path.join(dir, "sent")
  fs.writeFileSync(path.join(dir, "omarchy-shell"), `#!/bin/bash\nprintf '%s\\n' "$@" > "${sent}.tmp"\nmv "${sent}.tmp" "${sent}"\n`, { mode: 0o755 })
  fs.writeFileSync(path.join(dir, "hyprctl"), `#!/bin/bash\ncat <<'JSON'\n${JSON.stringify(clients || [])}\nJSON\n`, { mode: 0o755 })
  const result = spawnSync(path.join(root, "bin", "island-agent"), args, {
    input: stdin === undefined ? "" : stdin,
    env: Object.assign({}, process.env, { PATH: dir + ":" + process.env.PATH }),
    cwd: os.tmpdir(),
    encoding: "utf8"
  })
  // The script answers at once and reports in the background.
  const deadline = Date.now() + 3000
  while (!fs.existsSync(sent) && Date.now() < deadline) spawnSync("sleep", ["0.05"])
  const lines = fs.existsSync(sent) ? fs.readFileSync(sent, "utf8").split("\n") : null
  fs.rmSync(dir, { recursive: true, force: true })
  return { result, lines }
}

test("the agent hook reports the state, project and window, and says nothing", () => {
  // This test's own process stands in for the terminal: it is an ancestor of the script.
  const clients = [{ pid: process.pid, address: "0xaaaa1111" }, { pid: 1, address: "0xbbbb2222" }]
  const hook = JSON.stringify({ session_id: "abc-123", cwd: "/home/someone/My Project", hook_event_name: "Notification", message: "Claude needs your permission to use Bash" })
  const { result, lines } = runAgentHook(["claude", "input"], hook, clients)
  assert.equal(result.status, 0)
  assert.equal(result.stdout, "")
  assert.equal(result.stderr, "")
  assert.ok(lines, "the script called omarchy-shell")
  assert.deepEqual(lines.slice(0, 3), ["-q", "island", "agent"])
  const payload = JSON.parse(lines[3])
  assert.deepEqual(payload, {
    state: "input", agent: "claude", window: "0xaaaa1111", project: "My Project",
    detail: "Claude needs your permission to use Bash", session: "abc-123"
  })
  assert.equal(Model.agentPayload(lines[3]).ok, true)
})

test("the agent hook survives hostile input and reads Codex's argument", () => {
  const hostile = JSON.stringify({ cwd: '/tmp/$(touch /tmp/island-pwned)";rm -rf ~;"', message: "`id` $HOME <b>x</b>", session_id: "--help" })
  let run = runAgentHook(["claude", "done"], hostile, [])
  let payload = JSON.parse(run.lines[3])
  // The project is the directory's own name, passed on as text and never run.
  assert.equal(payload.project, 'island-pwned)";rm -rf ~;"')
  assert.equal(payload.detail, "`id` $HOME <b>x</b>")
  assert.equal(payload.window, "")
  assert.ok(!fs.existsSync("/tmp/island-pwned"))

  // Codex: the JSON is the last argument, and only a finished turn counts.
  run = runAgentHook(["codex", "notify", JSON.stringify({ type: "agent-turn-complete", cwd: "/srv/api" })], "", [])
  payload = JSON.parse(run.lines[3])
  assert.equal(payload.state, "done")
  assert.equal(payload.project, "api")
  assert.equal(runAgentHook(["codex", "notify", JSON.stringify({ type: "something-else" })], "", []).lines, null)

  // A sign-in notice is not a wait for the user; garbage on stdin is not fatal.
  assert.equal(runAgentHook(["claude", "input"], JSON.stringify({ notification_type: "auth_success" }), []).lines, null)
  run = runAgentHook(["claude", "done"], "not json at all", [])
  assert.equal(JSON.parse(run.lines[3]).state, "done")

  // Two windows in one terminal process cannot be told apart: neither is named.
  run = runAgentHook(["claude", "done"], "{}", [{ pid: process.pid, address: "0xaaaa1111" }, { pid: process.pid, address: "0xcccc3333" }])
  assert.equal(JSON.parse(run.lines[3]).window, "")

  assert.equal(runAgentHook([], "", []).result.status, 2)
})

// -------------------------------------------------------- the QML itself

// Text from a player, a label or a file must never reach an AutoText sink,
// where markup-shaped input is parsed and can load a remote resource. Every
// Text in the plugin is an IslandText, which is PlainText; this holds the
// line as the plugin grows.
function qmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "tests" ? [] : qmlFiles(full)
    return entry.name.endsWith(".qml") ? [full] : []
  })
}

test("no QML file declares a Text that could parse markup", () => {
  const files = qmlFiles(root)
  assert.ok(files.length >= 10, "found the plugin's QML")
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8")
    const name = path.relative(root, file)
    if (name === path.join("components", "IslandText.qml")) {
      assert.match(source, /textFormat:\s*Text\.PlainText/, name)
      continue
    }
    assert.doesNotMatch(source, /^\s*(Text|Label|TextEdit|TextArea|TextInput)\s*\{/m, `${name} uses a raw text element`)
    assert.doesNotMatch(source, /textFormat\s*:/, `${name} overrides the text format`)
  }
})

// A function in a QML file cannot take the name of a property its base type
// already has: the property wins, and calling the "function" throws. That is
// how clicking a row on the agents page once did nothing at all.
test("no QML function hides behind a built-in property of the same name", () => {
  const taken = new Set(["focus", "clip", "enabled", "visible", "state", "states", "transitions", "parent", "data",
    "children", "resources", "visibleChildren", "childrenRect", "x", "y", "z", "width", "height", "implicitWidth",
    "implicitHeight", "opacity", "rotation", "scale", "transform", "transformOrigin", "anchors", "layer", "smooth",
    "antialiasing", "baselineOffset", "activeFocus", "activeFocusOnTab", "focusPolicy", "containmentMask", "palette",
    // PanelWindow's own, for IslandWindow.qml.
    "screen", "color", "mask", "margins", "exclusiveZone", "exclusionMode", "contentItem", "surfaceFormat", "aboveWindows"])
  for (const file of qmlFiles(root)) {
    const source = fs.readFileSync(file, "utf8")
    for (const match of source.matchAll(/^\s*function\s+([A-Za-z_]\w*)\s*\(/gm))
      assert.ok(!taken.has(match[1]), `${path.relative(root, file)} declares function ${match[1]}()`)
  }
})

test("nothing in the plugin runs text through a shell", () => {
  for (const file of qmlFiles(root)) {
    const source = fs.readFileSync(file, "utf8")
    const name = path.relative(root, file)
    assert.doesNotMatch(source, /Util\.execDetached|bar\.run\(|"-lc"/, `${name} interpolates a shell command`)
  }
})

test("every string the QML asks for is in the English catalog", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "i18n", "en.json"), "utf8"))
  // Keys the QML builds at run time rather than writing out.
  const wanted = new Set(["battery.plugged", "battery.unplugged", "battery.charged", "battery.low",
    "privacy.microphone", "privacy.camera"])
  for (const file of qmlFiles(root)) {
    const source = fs.readFileSync(file, "utf8")
    for (const match of source.matchAll(/\.t\("([a-zA-Z.]+)"\)/g)) wanted.add(match[1])
    // t(condition ? "one.key" : "other.key")
    for (const call of source.matchAll(/\.t\(([^()]*\?[^()]*)\)/g)) {
      for (const key of call[1].matchAll(/"([a-z]+\.[a-zA-Z]+)"/g)) wanted.add(key[1])
    }
  }
  assert.ok(wanted.size > 15)
  for (const key of wanted) assert.equal(typeof catalog[key], "string", `missing ${key}`)
})

// ------------------------------------------------------------- the docs

// The guides are what other people build against, so what they promise is
// held to what the plugin does.
const integrationGuide = fs.readFileSync(path.join(root, "INTEGRATION.md"), "utf8")
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8")
const service = fs.readFileSync(path.join(root, "Service.qml"), "utf8")

test("the integration guide lists exactly the icons there are", () => {
  const block = integrationGuide.split("## Icons")[1].match(/```\n([\s\S]*?)```/)[1]
  const listed = block.trim().split(/\s+/)
  assert.deepEqual(listed.slice().sort(), Object.keys(Model.icons).sort())
  assert.equal(new Set(listed).size, listed.length)
})

test("every method the guide documents is one the island answers", () => {
  for (const method of ["notify", "activity", "agent", "osd", "status", "icons", "ping"]) {
    assert.match(integrationGuide, new RegExp("`" + method + "`"), `guide mentions ${method}`)
    assert.match(service, new RegExp("function " + method + "\\("), `island answers ${method}`)
  }
  assert.match(integrationGuide, new RegExp('"api": ' + Model.API_VERSION + "\\b"))
  // The limits it states are the limits there are.
  assert.match(integrationGuide, /Eight activities at once/)
  assert.equal(Model.MAX_ACTIVITIES, 8)
})

test("the guide's example payloads are ones the island accepts", () => {
  const examples = [...integrationGuide.matchAll(/omarchy-shell island (notify|activity) '(\{.*\})'/g)]
  assert.ok(examples.length >= 2)
  for (const [, method, payload] of examples) {
    const result = method === "notify" ? Model.notifyEvent(payload) : Model.activityPayload(payload)
    assert.equal(result.ok, true, payload)
  }
  const agentExample = integrationGuide.match(/```json\n(\{"state".*\})\n```/)[1]
  assert.equal(Model.agentPayload(agentExample).ok, true)
})

test("the README documents every setting and only real demos", () => {
  for (const key of Object.keys(Model.DEFAULTS))
    assert.match(readme, new RegExp("\\| `" + key + "` \\|"), `README documents ${key}`)
  const demos = readme.match(/previews one: ([\s\S]*?)\.\n/)[1].match(/`([a-z]+)`/g).map((name) => name.slice(1, -1))
  assert.ok(demos.length >= 10)
  for (const demo of demos) assert.ok(service.includes(`sample === "${demo}"`), `demo ${demo} exists`)
  for (const page of Model.PAGES) assert.match(readme, new RegExp("\\b" + page + "\\b"))
  // Every command the README shows is one the island answers.
  const commands = new Set([...readme.matchAll(/omarchy-shell island ([a-zA-Z]+)/g)].map((match) => match[1]))
  assert.ok(commands.has("playerNext"))
  for (const command of commands) assert.match(service, new RegExp("function " + command + "\\("), `island answers ${command}`)
  // The marks are documented where the code makes them.
  assert.match(readme, /## Microphone and camera/)
  assert.match(integrationGuide, /"privacy": \{"microphone"/)
  assert.ok(service.includes("privacy: {"))
})

test("the README's uninstall filter removes the island's hooks and nothing else", () => {
  const filter = readme.match(/jq '(if \(\.hooks\|type\)[^']+)' "\$f\.bak"/)[1]
  const island = "/home/someone/.config/omarchy/plugins/" + Model.PLUGIN_ID + "/bin/island"
  const strip = (settings) => {
    const run = spawnSync("jq", ["-c", filter], { input: JSON.stringify(settings), encoding: "utf8" })
    assert.equal(run.status, 0, run.stderr)
    return JSON.parse(run.stdout)
  }
  // Both ways the hooks are written: one command line, or a program and its arguments.
  const ours = { type: "command", command: island + " agent claude done", async: true }
  const oursExec = { type: "command", command: island + "-agent", args: ["claude", "input"] }
  const theirs = { type: "command", command: "prettier --write ." }

  assert.deepEqual(strip({ theme: "dark", hooks: { Stop: [{ hooks: [ours] }], Notification: [{ hooks: [oursExec] }] } }), { theme: "dark" })
  assert.deepEqual(
    strip({ hooks: { Stop: [{ hooks: [ours, theirs] }, { hooks: [ours] }], PostToolUse: [{ matcher: "Edit", hooks: [theirs] }] } }),
    { hooks: { Stop: [{ hooks: [theirs] }], PostToolUse: [{ matcher: "Edit", hooks: [theirs] }] } })
  // Nothing of ours there, or no hooks at all: left exactly as it was.
  assert.deepEqual(strip({ hooks: { Stop: [{ hooks: [theirs] }] } }), { hooks: { Stop: [{ hooks: [theirs] }] } })
  assert.deepEqual(strip({ theme: "dark" }), { theme: "dark" })
  assert.deepEqual(strip({ hooks: "odd" }), { hooks: "odd" })
})

test("the README says what is needed and how to leave", () => {
  for (const heading of ["## Requirements", "## Install", "## Uninstall"]) assert.ok(readme.includes(heading), heading)
  assert.match(readme, /Needs a MacBook with a notch/)
  assert.ok(readme.includes("omarchy plugin remove " + Model.PLUGIN_ID))
  assert.ok(readme.includes("omarchy plugin add "))
})

test("the manifest names this plugin and its entry point exists", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"))
  assert.equal(manifest.id, Model.PLUGIN_ID)
  assert.equal(manifest.schemaVersion, 1)
  assert.deepEqual(manifest.kinds, ["service"])
  assert.ok(fs.existsSync(path.join(root, manifest.entryPoints.service)))
})
