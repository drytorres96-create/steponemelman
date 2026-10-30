# MyQBank 1.44: glass, motion and soft feedback

The Suave adaptation now responds to interaction as well as defining typography and shape. The charcoal/jade/forest/coral palette and clinical state colors remain authoritative.

## Interaction design

- Dashboard/navigation surfaces use supported backdrop blur, soft layered shadows and a pointer-follow reflection. Static opaque surfaces remain the fallback. Reading text and answer layouts do not tilt.
- Controls ease into hover, selection and press states; header and study toolbar targets do not drift. Fine-pointer reflection is requestAnimationFrame-batched and clears on blur, visibility changes, preference changes and unmount.
- Dashboard cards arrive in a short sequence. Settings, labs, results and sheets have purposeful entrances; supported browsers fade dialogs out using discrete display transitions.
- Reused question panels transition without remounting drafts, focus, clocks or providers. Reduced-motion preferences suppress spatial animations and transitions, including changes made while an animation is running.
- Sound can be enabled from the header or Settings, with a preview. It starts off, persists only in a separate browser preference, and never plays on reload or hover. Short synthesized sine tones with low-pass filtering and gentle envelopes distinguish choice, open/close, review, success and block completion.
- Result audio requires a pending local answer/end action. Remote synchronization and restored answers do not celebrate. Test-mode right/wrong submissions use the same neutral cue until the block ends.
- Audio is lazy, gesture-activated, rate-limited and quiet. Muting, hiding the tab or disposing cancels notes; unsupported or blocked WebAudio is nonfatal. No audio assets, dependency additions or network requests.

## Verification

New unit coverage exercises audio opt-in, storage failure, rate limiting, gesture gating, resume races, mute/background cancellation and cleanup. New browser tests exercise switch persistence, silence on load/hover, identical Test-mode answer cues, reduced motion and 320/390px target geometry. Existing unit, E2E, preview and build gates remain enabled. Integrated before/after captures compare this branch against the exact 1.43.0 merge with identical synthetic data.

No database/schema/RPC, question text, answer identifiers, grading rules, saved history or paid AI calls change.

## References

User-supplied Suave MOTION.md and SOUND.md informed the timing and interaction vocabulary. React owns all state; the reference's imperative DOM code is not installed.

- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
