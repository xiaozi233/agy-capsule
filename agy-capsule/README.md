# agy-capsule

Real-time context window, quota, and generation speed capsules for the Antigravity composer footer.

## Features
- **Ground-Truth Telemetry**: Reads exact API token counts (`uncached_input`, `cached_input`, `output_tokens`, `thinking_tokens`) from the local conversation database (`%USERPROFILE%\.gemini\antigravity\conversations\<id>.db` on Windows, `~/.gemini/antigravity/conversations/<id>.db` on macOS/Linux), and resolves each session's active context limit dynamically from model metadata (`0 / --` before the first turn).
- **Compaction-Aware Breakdown**: Uses the latest billed turn (`uncached_input + cached_input`) for active context usage and resets breakdown accumulation (`Turn0`, `Read`, `Think`, `Write`) at the latest compaction checkpoint (`step_type = 23` or token-drop fallback).
- **Generation Speed**: Follows [agy-tool](https://github.com/justhil/agy-tool)'s overall/streaming split. The inline overall rate uses `ModelUsageStats.output_tokens` (including thinking, with a fallback to thinking + response counts) / (`time_to_first_token` + `streaming_duration`). The context popover and sidecar page also show response tokens / streaming duration and `TTFT`. Durations retain protobuf seconds/nanoseconds precision; samples shorter than 40ms overall or 30ms streaming are omitted. A pending request keeps the previous completed reading marked `prev.` in the popover; missing telemetry displays `-- tok/s`.
- **Composer Capsules & Popovers**: Displays live context percentage, generation speed, and matched model quotas (`Gemini`, `Claude`, `Argon`, `Carbon`) directly in the composer footer, with hover popovers for token breakdown, 3m/4m cache expiry estimates, and 5h/Weekly reset countdowns.
- **Narrow Fallback**: Progressively degrades when the composer narrows (hide speed → hide Weekly quota or `--%` placeholder → keep 5h icon → keep context & quota icons → ellipsis-truncate the model selector) to preserve hover access without overlap.
- **Local Font Fallbacks & Theme Sync**: Prefers Source Han Sans and falls back to the system UI font (no downloads), while adapting to light/dark themes via host CSS variables.
