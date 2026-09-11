# 2026-09-11 (Fri) — Speak button moved inside the Re-write text box

> Names are replaced with role labels per repository convention — **the manager**,
> **the developer**, **the study coordinator**, **the NLP team**, **PI**.
> No PHI: no patient identifiers, transcript content, or real (including hashed)
> transcript filenames appear here.
> Markers: ✅ done / ⬜ not started / 🔄 in progress / ⏸️ deferred / ⚠️ partial.

## 1. Source

- Asked by the developer on 2026-09-11: *"can the Speak button be placed inside
  the text box?"*
- This is the **fourth** position for this button. The history matters, because
  the reason it was not already inside is recorded in the code:
  [`2026-09-01_webapp_feedback.md`](2026-09-01_webapp_feedback.md) items 8 and 8d.

## 2. Items

| # | Item | Detail | Repo / target | Status |
|---|---|---|---|---|
| 1 | **Move the Speak button inside the Re-write text box** | Out of the "How would you say it better?" heading row, into the input box itself | dashboard (`app/Webapp`) | ✅ deployed and verified on the live `:3443` / `:3001`; not committed |

---

### Item 1. Inside the box, but not floating over the text

**Request.** "Can the Speak button be placed inside the text box?"

**Why the code said no.** The call site carried this comment, added when the
button was first placed:

> *"Kept out of the textarea itself: a button floating over the box would cover
> the text being written."*

That statement is **true of the approach it was written about, and only that
one**. It assumed the button would be positioned `absolute` over the textarea. A
textarea's padding is part of its **scroll area**, so no amount of `padding-bottom`
keeps text clear of a floating button — the text scrolls underneath it. Painting an
opaque background behind the button hides the collision rather than removing it: a
character or two is still covered.

**What was actually wrong was the containment, not the position.** There is a
second way to be inside the box that the original comment never considered: move
the border, background and focus ring from the `<textarea>` to a wrapper `<div>`,
and place the button **below the textarea but inside that wrapper**. The button is
then visually enclosed by the input, and sits entirely outside the textarea's
scroll area — so overlap is not merely avoided, it is structurally impossible.
This is the structure ChatGPT, Claude and Gemini use for their own input boxes.

**How this differs from the arrangement that was rejected on 2026-09-10.** Item 8d
records a rejected attempt that put the button on the textarea's top edge,
right-aligned, with a "Type below, or" lead-in. The objection was that the button
*floated in white space with nothing beside it*. Here the button is inside the
box's own border, so it reads as part of the input rather than as a control
stranded on an empty row.

**Change** (`PhysicianReportsModifiedV41Timothy.tsx`, one file):

1. `<RewriteVoiceInput>` and its comment removed from the "2 — How would you say
   it better?" heading row. That row keeps its number chip and prompt, and its
   height is unchanged.
2. The `<textarea>` is wrapped in a `<div>` that now carries
   `rounded-lg border transition-colors` plus the theme's background and border
   colours. The textarea itself becomes `bg-transparent border-0`.
3. **`focus:ring-2` became `focus-within:ring-2` on the wrapper.** Without this
   move the focus ring disappears while typing, because the ring was an attribute
   of the element that no longer draws the box. Colour, width and radius are the
   previous values, so the box looks the same.
4. `p-4` became `px-4 pt-4 pb-2` on the textarea, and the button sits in a
   `flex items-center px-3 pb-3` footer row inside the wrapper.
5. **Button on the left of that row**, because the textarea's resize handle is in
   the opposite (bottom-right) corner. Right-aligning would put the two controls
   on top of each other.
6. **`resize-y` made explicit.** Written on the assumption that the textarea was
   inheriting the browser default of `resize: both`. **Measurement disproved
   that** — the deployed build already computes `resize: vertical`, because
   Tailwind's preflight sets it. The class was kept anyway, since stating the
   behaviour beside the new wrapper is clearer than inheriting it, but it changes
   nothing and should not be described as a fix.

`RewriteVoiceInput.tsx` is untouched: its `flex items-center gap-2` wrapper still
shows an error message beside the button, and the `data-tour='rewrite-voice-button'`
anchor the onboarding tour spotlights is unchanged.

**Static checks.**

| Check | Result |
|---|---|
| `npx tsc --noEmit`, errors in the edited file | **0** |
| `npx tsc --noEmit`, whole-project total | **609** — the documented baseline, unchanged |
| `npm run lint` | clean (only the pre-existing warnings) |
| `npm test` | **278 / 278 pass** |
| `npm run build` | succeeds |

**Measured**, headless Chromium at 1600 × 1000, against the new build on a
**throwaway server bound to `127.0.0.1:3900`** — the live containers were never
touched and stayed up throughout. "Before" is the still-deployed build on `:3001`.

| Measurement | Before (`:3001`) | After (`:3900`) |
|---|---|---|
| Buttons in the "How would you say it better?" row | 1 | **0** |
| Button position | heading row, 66 px above the box | **inside the box**, bottom-left |
| Button rect fully inside the input box's rect | n/a (outside) | **true** |
| Text box: outer height | 112 px | **157 px** (+45) |
| Text box: textarea height | 112 px | 102 px (inside a 1 px border) |
| Textarea padding | `16 16 16 16` | `16 16 8 16` |
| Textarea `resize` | `vertical` | `vertical` — unchanged |
| Textarea border / background | `1px` / opaque | **`0px` / transparent** (moved to the wrapper) |

**The load-bearing check — does text ever pass under the button?** 20 lines were
pasted in (`scrollHeight` 544 px vs `clientHeight` 102 px, so the textarea really
is scrolling), then read at two scroll positions:

| Scroll position | Text ∩ button overlap |
|---|---|
| `scrollTop = 0` (top) | **0 px²** |
| `scrollTop = 221` (mid-scroll) | **0 px²** |

Zero at every position, because the button is outside the scrolling box rather
than painted over it. This is the claim the old comment said could not be met.

**Focus ring.** Moved to the wrapper and confirmed present in both themes:

| Theme | Wrapper background | Wrapper border | Focus ring |
|---|---|---|---|
| Light | `rgb(255,255,255)` | `1px rgb(203,213,225)` — slate-300 | `rgb(34,211,238)` 2 px — cyan-400 |
| Dark | `rgb(51,65,85)` — slate-700 | `1px rgb(71,85,105)` — slate-600 | `rgb(8,145,178)` 2 px — cyan-600 |

Geometry is identical in both themes (wrapper 157 px, overlap 0).

**The onboarding tour needed no change after all.** `OnboardingTour.tsx:150` still
says `placement: "left"`. react-joyride could not fit a tooltip to the left of a
button that now sits near the panel's left edge, so it **auto-flipped the tooltip
above the button**, arrow pointing down at it. Measured on the new build:

| Tour check | Result |
|---|---|
| Step number and title | **5 of 7 — "Dictate Your Re-write"** (unchanged) |
| Spotlight fully encloses the button | **true** (spotlight `253,616 118×54` vs button `263,626.8 98.4×34`) |
| Tooltip clipped by the viewport | **0 px** on all four sides |

So the `placement` value was left alone rather than changed to match a guess — the
engine already does the right thing. `TOUR_VERSIONS.detail` is **not** re-bumped
either: the button moved, it did not appear, so replaying the tour for doctors who
already saw it would tell them nothing new.

**Dictation itself still works after the DOM move** — `e2e/voice-input-cross-browser.spec.ts`
run against `:3900` in all three engines, each loading both models and transcribing
the public-domain clip into the textarea:

| Engine | Secure ctx | AudioWorklet | Module worker | WASM SIMD | Context rate | Transcript |
|---|---|---|---|---|---|---|
| Chromium | ✅ | ✅ | ✅ | ✅ | 16 000 Hz | ✅ (20.1 s) |
| Firefox | ✅ | ✅ | ✅ | ✅ | 16 000 Hz | ✅ (36.7 s) |
| WebKit | ✅ | ✅ | ✅ | ✅ | 16 000 Hz | ✅ (21.3 s) |

No selector change was needed: the spec locates `[data-tour='rewrite-voice-button']
button` and the first `textarea`, both of which still resolve. WebKit logged one
`Failed to load resource` console line, which the spec's filter does not match
because WebKit words it differently from Chromium; it is not related to this change.

**One check could not be run on the throwaway port.** The spec's second test —
"says why it is unavailable over plain http" — **skipped** there, because it
derives the insecure URL by rewriting `https:`→`http:` and `:3443`→`:3001`, and
the throwaway URL is already plain http on `127.0.0.1` (a secure context by
definition). It was left as the one item needing the real deployment. It now
passes — see below.

**Deployed** on 2026-09-11, on request, after everything above was green.

```
docker compose -f docker-compose-frontend.yml up -d --build webapp
```

Only the `webapp` service was named, so `webapp-tls` (`:3443`) and the other
projects' containers on this host were untouched. The image rebuilds from
`app/Webapp/Dockerfile`, which runs its own `npm ci && npm run build` — the host
build is not reused.

| Deployment check | Result |
|---|---|
| Image id | `4e9a43882a49` (2026-09-10) → **`63e679777748`** (2026-09-11) |
| `prostatecancer-webapp-native` | recreated, **Up (healthy)**, `0.0.0.0:3001->3000` |
| `prostatecancer-webapp-tls` | untouched, still Up 22 h (healthy) |

**Re-measured against the live TLS deployment**, both themes, and the numbers are
identical to the `:3900` run — wrapper 1100 × 157, textarea 1098 × 102, button
98 × 34 at the bottom-left, `buttonInsideWrapper: true`, textarea `border 0px` /
transparent / padding `16 16 8 16` / `resize vertical`, light `rgb(255,255,255)`
on `rgb(203,213,225)` and dark `rgb(51,65,85)` on `rgb(71,85,105)`. The scroll
test reproduced too: `scrollHeight` 544 vs `clientHeight` 102, overlap **0 px²**
at the top and **0 px²** at mid-scroll, in both themes.

The heading row holds **0 buttons**. (A first measuring pass reported 3; its scope
had walked one parent too far and was counting the whole panel — "Scoring rubric",
"Speak" and "Try & Score". Scoped to the heading row itself: empty. There is
exactly 1 `[data-tour='rewrite-voice-button']` on the page.)

**Both e2e tests now pass against the deployment**, including the one that could
not run before:

| Test (Chromium, `:3443`) | Result |
|---|---|
| loads both models and transcribes a spoken sentence | ✅ 20.5 s — transcript landed in the textarea |
| says why it is unavailable over plain http (`:3001`) | ✅ 4.1 s — button disabled, reads "Voice unavailable", typing unaffected |

So the split is confirmed on the running system: dictation works on https `:3443`
and is cleanly disabled with a stated reason on plain http `:3001`, which is the
documented and deliberate trade.

## 3. Status as of 2026-09-11

| # | Item | Code | tsc / lint / Jest | Built | Verified | Deployed | Committed |
|---|---|---|---|---|---|---|---|
| 1 | Speak button inside the Re-write text box | ✅ | ✅ | ✅ | ✅ (`:3900` + live `:3443`, both themes, 3 engines) | ✅ | ✅ |

Committed to `feat/rewrite-voice-input` in three commits — the component change,
the speech-to-text architecture doc, and this log — and pushed.

### Outstanding

1. **Button size inside the box.** It went in at its existing size
   (`px-3 py-1.5 text-sm`, measured 98.4 × 34 px). A smaller variant may read
   better now that it sits inside the input; deliberately not pre-emptively changed.
2. **Footer alignment.** Left was chosen so the button clears the textarea's
   resize handle in the opposite corner. If the right side is preferred after
   seeing it, `justify-end` is the whole change.
