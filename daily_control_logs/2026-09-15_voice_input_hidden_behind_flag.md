# 2026-09-15 (Tue) — Dictation taken off the screen, behind one switch

> Names are replaced with role labels per repository convention — **the manager**,
> **the developer**, **the study coordinator**, **the NLP team**, **PI**.
> No PHI: no patient identifiers, transcript content, or real (including hashed)
> transcript filenames appear here.
> Markers: ✅ done / ⬜ not started / 🔄 in progress / ⏸️ deferred / ⚠️ partial.

## 1. Source

- Asked by the developer on 2026-09-15: take the Speak button off the screen for
  now, and make it easy to show again later.
- Nothing is wrong with the feature. It went out of sight while the manager is
  being told about it as work in progress, not as something to try yet.

## 2. Items

| # | Item | Detail | Repo / target | Status |
|---|---|---|---|---|
| 1 | **Hide the Speak button** | Off the doctor's screen; the code stays | dashboard (`app/Webapp`) | ✅ deployed to `:3001` / `:3443` |
| 2 | **One switch to bring it back** | Replaced the comment-outs with `VOICE_INPUT_ENABLED` | dashboard (`app/Webapp`) | ✅ built and verified; ⬜ not deployed |

---

### Item 1. Hidden, not removed

The first pass commented out the four places the button reaches into:

| Place | Why it had to go too |
|---|---|
| The footer row in `PhysicianReportsModifiedV41Timothy.tsx` | The button itself |
| Its `import`, `handleVoiceText`, and the `appendTranscript` import | Unused after the above — lint fails otherwise |
| The "Dictate Your Re-write" step in `OnboardingTour.tsx` | A step whose target is never rendered **stalls** the tour rather than skipping it |
| The textarea's `pb-2` | The footer supplied the bottom padding; without it the box looks clipped at the bottom |

Built and deployed with
`docker compose -f docker-compose-frontend.yml up -d --build webapp` — the named
service only, so the other 17 containers on this host were untouched. Image
rebuilt to `e93c8a11b0a7`; `:3001` and `:3443` both answer 200 and the container
reports healthy.

### Item 2. `VOICE_INPUT_ENABLED`

Four commented-out blocks is a bad way to keep a feature parked: whoever brings it
back has to find all four and get the padding right. They were replaced by one
exported constant in `app/Webapp/src/lib/sttConstants.ts`:

```ts
export const VOICE_INPUT_ENABLED = false;
```

Every site now reads it — the footer row renders only when it is true, the
textarea picks `pb-2` or `pb-4` from it, and the tour step is spread into
`DETAIL_STEPS` only when it is true. Restoring the feature is **one character**,
plus a build.

Nothing is downloaded while it is off: the models load on a click, and there is no
longer a click to make. The worker, the hook and `RewriteVoiceInput.tsx` are left
exactly as they were.

### Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 609 errors — the unchanged repo baseline; 0 in the edited files |
| `npm run lint` | no errors (pre-existing `exhaustive-deps` warnings only) |
| `npm test` | 278 / 278 |
| `npm run build` | succeeds |

`e2e/voice-input-cross-browser.spec.ts` now has no button to find and will fail
while the switch is off. It is not in the default Playwright config, so the normal
suite is unaffected.

## 3. Status as of 2026-09-15

| # | Item | Code | tsc / lint / Jest | Built | Deployed | Committed |
|---|---|---|---|---|---|---|
| 1 | Speak button hidden | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | `VOICE_INPUT_ENABLED` switch | ✅ | ✅ | ✅ | ⬜ | ✅ |

### Outstanding

1. **The switch version is not deployed.** What is live is the commented-out
   build from earlier the same day. On screen the two are identical — no button
   either way — so this is housekeeping, not a fix.
2. **The 2026-09-11 once-per-visit model loading is deployed as of today** as part
   of the same image, and is dormant while the switch is off.
3. `e2e/voice-input-cross-browser.spec.ts` should be skipped, not fixed, until the
   switch goes back to `true`.
