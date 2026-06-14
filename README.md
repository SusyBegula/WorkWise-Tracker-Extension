# WorkWise Tracker Extension

A specialized, high-performance browser extension designed to monitor employee activity, track task completion times, analyze UI interactions, and capture screen visual data to provide actionable efficiency insights.

Built using the [Plasmo extension framework](https://docs.plasmo.com/) and React.

---

## Features

### 1. Interactive Control Dashboard (Popup UI)
- **Session Controls**: A modern, dark-themed control center featuring a power button to start/stop tracking and a pause/resume toggle for breaks.
- **Dynamic Clock**: Live stopwatch displaying the elapsed session time.
- **Real-Time Work Metrics**:
  - **Active Work Time**: Total time spent working.
  - **Paused Break Time**: Total duration of pauses.
  - **Pause Count**: Number of times the session was paused.
  - **Events Tracked**: Count of user interactions captured.

### 2. Activity Capture (Content Script)
- **Mouse Click Logging**: Captures precise elements clicked (HTML tag, classes, IDs, inner text) and coordinate offsets.
- **Keystroke Buffering**: Dynamically logs user keyboard inputs. Keystrokes are buffered and flushed in blocks to optimize network payloads and avoid telemetry spam.
- **Privacy Controls**: Automatically masks inputs from password fields into `*` and transforms control keys (e.g. `[Enter]`, `[Tab]`) into clear log markers.

### 3. State & Telemetry Engine (Background Service Worker)
- **Session State Machine**: Manages three session modes: `active`, `paused`, and `inactive`.
- **Browser Lifecycle Listeners**: Detects active tab switching, URL navigations, tab closures, and changes in browser window focus.
- **Idle State Checks**: Hooks into system idle monitoring to log locked states or periods of inactivity.
- **Visual Capture**: Periodically captures a compressed screenshot (`chrome.tabs.captureVisibleTab`) of the active window every 1 minute (configurable for production) while tracking is active.
- **API Logger Sync**: Transitions and events are automatically sent to the local logging endpoint: `http://localhost:3000/api/activity`.

---

## Required Permissions

To function correctly, the extension declares these API scopes:
- `storage`: Preserves and caches the state machine and statistics.
- `alarms`: Schedules periodic screenshot capture intervals.
- `activeTab` / `tabs`: Retrieves active tab URLs and window context.
- `idle`: Detects user locking and system idle state changes.

---

## Getting Started

### Development Mode

First, run the development server:

```bash
pnpm dev
# or
npm run dev
```

1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle at top-right).
3. Click **Load unpacked** and select the generated development build directory: `build/chrome-mv3-dev`.

The popup will auto-reload as you save changes in `popup.tsx` or `popup.css`.

### Production Build

To build the production-ready package:

```bash
pnpm build
# or
npm run build
```

This compiles a minimized, highly optimized extension bundle inside the `build/chrome-mv3-prod` directory, ready to be zipped and published.
