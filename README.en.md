# agy-capsule

[中文](./README.md) | **English**

Context, quota, and generation speed capsules in the Antigravity composer footer.

<p align="center">
  <img src="assets/composer-quota-light.png" width="100%" alt="Light composer with inline capsules and multi-model quota panel" />
</p>
<p align="center">
  <img src="assets/composer-context-dark.png" width="100%" alt="Dark composer with context breakdown, plus yellow cache warning at 3 minutes and red expiry at 4 minutes" />
</p>

## Features

- **Inline capsules**: Embedded in the composer footer to show the current session's context usage against the model's live context limit (e.g. `256k` / `512k`, or `0 / --` before the first turn) and remaining 5h / Weekly quotas in real time.
- **Token breakdown**: Hover to see the proportions and token counts for `Turn0`, `Read`, `Think`, and `Write`.
- **Generation speed**: Following [agy-tool](https://github.com/justhil/agy-tool), show overall speed (output tokens including thinking / (time to first token + streaming duration), e.g. `42.1 tok/s`) inline. Hover the speed capsule for streaming speed (response tokens / streaming duration) and time to first token (`TTFT`). Keep the previous completed reading marked `prev.` in the popover while a new request has no usage; missing telemetry displays `-- tok/s`. On narrow footers, the speed folds away but remains in the context hover popover.
- **Settings pane**: Open **agy-capsule** under `⋮` → Extensions. Toggle context, speed, 5h, and weekly readouts independently. Place the context, speed, and quota groups near either side of the space between the native controls, preserving native button order. In Layout, drag to reorder or change sides, or use the up/down arrows to set the left-to-right order on each side. Settings persist and apply immediately; rapid changes coalesce and position transitions continue from the current visual position.
- **Cache expiry alerts**: Turn yellow 3 minutes after the last turn with a countdown (`~1m`), and turn red at 4 minutes to mark `Cache` as expired.
- **Multi-model quota panel**: Automatically match the model selected in the footer (such as `Gemini`, `Claude`, `Argon`, or `Carbon`). Hover to see each group's remaining 5h and weekly quotas, plus reset countdowns.
- **Responsive narrow layout**: Degrades progressively as the footer narrows (hide speed, then Weekly quota, keep icons with hover popovers, then ellipsis-truncate the model selector) to prevent overlap.
- **Native styling**: Match the host controls' font, icon size, button height, and theme colors, without separators between capsules. Popovers align with their capsule's left edge on the left side and right edge on the right side, with edge avoidance and stable positioning during polling. Keyboard navigation and reduced motion are supported.
- **Light / dark adaptation & cross-version compatibility**: Reuse the host's CSS variables directly; mount via a native Sidecar and CDP without modifying client source code, so it keeps working after client updates.

## Installation

1. Copy the [`agy-capsule`](./agy-capsule) folder into the Antigravity plugins directory:
   - **Windows**: `%USERPROFILE%\.gemini\config\plugins\agy-capsule`
   - **macOS / Linux**: `~/.gemini/config/plugins/agy-capsule`
2. Enable **agy-capsule** in Antigravity's **Plugins** panel.

## Notices

- **Cache expiry is an estimate**: The cache status indicator (yellow warning at 3 minutes / red expired at 4 minutes) is estimated locally based on elapsed time since the last turn and is for reference only; actual cache hits depend on the server.
- **Tested environments & feedback**: Currently tested only on **Windows**. Testing, feedback, and PRs on **macOS** are very welcome!

## License

[MIT](./LICENSE)
