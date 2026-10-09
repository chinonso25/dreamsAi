# Dreamer UI and recording refresh — 9 October 2026

The app version is 1.0.5. The existing EAS production profile still uses remote build numbering with automatic increments. No archive, EAS build, update, or store upload was submitted.

The native splash now uses the existing transparent moon-and-star logo on matching light and dark backgrounds, with a short fade. Home and loading states use the same brand. The current source contains no TV animation; the legacy blue loader was replaced with branded loading feedback.

Add Dream puts a large voice recording card before the text area. The recorder displays microphone measurements in a waveform, an elapsed timer, and pause/finish controls. The capture modal has one close control and its own safe-area provider. Playback has a waveform-shaped seek track, time labels, and compact controls; the playback shape is decorative, while the recording wave uses real microphone levels.

Restored drafts and saved journal recordings resolve known iOS recording paths against the current app container. Draft previews do not depend on OS lock-screen controls. Finishing capture restores the playback audio session before closing the recorder. Clear audio removes the attachment and temporary recovery reference while preserving written text and recordings still referenced by another retained draft.

Search has prominent Favorites, Dates, and Filters controls, removable active filters, a visible result count, and stronger selected states. Favorites on a dream use a quieter outlined control below the title. Light-theme text, borders, and accent colors have stronger contrast.

## Verification

- Mobile TypeScript: passed.
- Full mobile ESLint with zero warnings: passed.
- Mobile Jest: 24 suites, 212 tests, and one snapshot passed.
- iOS Simulator: opened Home, Add Dream, recorder, Search, filters, and dream detail with the updated JavaScript bundle in the existing development binary. Recorded audio, observed the microphone waveform and elapsed time, finished capture, and played the retained draft with advancing playback time.
- iOS native generation: passed with the new splash artwork, light/dark colors, and Info.plist version 1.0.5. CocoaPods installation passed. The regenerated native project has not been compiled into a new binary, so cold-launch splash behavior needs the next native build.
- Missing-file clearance, previous-container recovery, and retention of another owner's shared draft recording are covered by regression tests.

Cloud sync displayed a service-unavailable message during simulator QA. Cloud sync, AI transcription, physical-device behavior, and build upload acceptance were not verified in this task.

## Screenshots

- [Recording waveform](recording-active.png)
- [Draft playback](audio-playback.png)
- [Dream detail and favorite control](dream-detail.png)
- [Filter sheet](filters.png)
