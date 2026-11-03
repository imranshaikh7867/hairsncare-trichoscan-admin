# HairsnCares · Care Atelier (React + Vite)

The TrichoScan admin workspace, converted from
`Trichoscan/connected-treatment-workspace/HairsnCares-Admin-Connected.html`
to React 19 + Vite.

## Which source this came from

`HairsnCares-Admin-Connected.html` (196 KB) is the **newer** admin: it is
`src/input/admin.html` (116 KB) plus the care bridge, confirmed by md5 —
the two differ, and the Connected copy is the one embedded in
`TrichoScan-Connected-Workspace.html`.

## The admin logic is not rewritten

`public/engine/admin-app.js` is the original application. It owns its own
DOM: routing between the workspace pages, rendering the template and
catalogue tables, the modals, mapping validation, revision-conflict checks
and the save/load path through the care bridge. Rewriting that as React state
would risk changing care-mapping and safety behaviour, which is exactly what
must not drift.

Four changes have been made to it, and nothing else — no care-mapping,
validation or revision logic is touched, and none of them is about the
database:

1. `status()` no longer writes the standing *"Ready · settings saved in this
   browser. 37 configured templates · 37 built-in templates."* line. The
   element stays, hidden, because the engine still needs somewhere to say
   that browser storage is unavailable and edits will be lost; that is the
   only thing it now shows.
2. The startup-error path un-hides that same element, since it writes there.
3. `route()` dispatches only `templates` and `products`, and anything else
   falls back to `templates`. `renderMatch`, `renderBackup` and `renderHelp`
   were then dead — each referenced only by its own declaration — and have
   been removed (111,153 → 105,389 characters, re-checked with `node --check`).
4. `renderProducts()` was rebuilt as a read-only, searchable catalogue — see
   below. `editProduct()` is deliberately kept, unreferenced, because it is
   the carried-over product editor and products become editable again once
   the admin API exists. It is the one thing oxlint reports in `src`.

React supplies what the original document supplied: the frame the script
expects (`#main`, `#modal`, `#toast`, `#status`, `#import-file` and the
`[data-page]` buttons) and the seed data it reads at startup.

## Signing in

Firebase email and password, the same project every HairsnCares panel uses.
Copy `.env.example` to `.env.local` and fill in the `VITE_*` values.

Sign-in is **two steps that both have to pass**:

1. Firebase checks the email and password.
2. `POST /admin/admins/me/sync` looks the resulting uid up in the `Admin`
   collection.

Step 2 is the one that surprises people. A Firebase account created in the
console has no `Admin` record, so the password is right and sign-in still
fails with *"No admin profile found. Contact your super admin to provision an
account."* Give the account its record once, from the backend:

```sh
cd ../hairsncares-backend
npm run admin:provision -- tricho_admin@hairsncares.com
```

When step 2 fails the Firebase session is signed out again, so the panel never
sits half-authenticated, and the API's own wording is shown rather than a
generic failure — the two failures need different fixes.

The Firebase web config in `.env.local` is **not** a secret; it ships inside
every client bundle by design. What protects the workspace is the API checking
the token and looking the account up, not hiding the key. Session persistence
is per-tab: a refresh keeps you in, closing the tab signs you out.

## Where the data lives

Not in this browser any more. The 37 care templates and the product catalogue
are the database's, through `/admin/hnc-care-templates`.

The workspace itself was not rewritten to do that. It keeps its state in two
browser keys and has exactly two functions that touch them — `load()` at
startup and `save()` on every change — and teaching it to speak HTTP would
mean making a synchronous application asynchronous throughout, which is the
surest way to break the mapping validation and the revision-conflict checks.

So the keys became a cache instead:

| | |
|---|---|
| **down** | `useCareSync` fills `hnc.care-template-products.v1` and `hnc.offline-catalogue.v2` from the API **before** the engine is allowed to start, so `load()` finds server data exactly where it expects browser data |
| **up** | `localStorage.setItem` is wrapped, so when `save()` writes the config the hook sees it and `PUT`s it, debounced by 800 ms |

The engine is untouched. It still believes it is talking to localStorage.

Three things follow from that design, each deliberate:

* **The engine does not start until the data has arrived.** Booting it first
  would show the 37 shipped templates with no products and let someone edit
  them, and the first save would push that over the real mapping. If the fetch
  fails the workspace is not started at all and the reason is shown instead.
* **Only the config travels upward.** The catalogue is the shop's, read-only
  here; the engine's own `save()` writes it back unchanged and that write is
  ignored.
* **The server's answer is written back after every save**, because it carries
  the revision numbers the database assigned. Left stale, the engine's own
  conflict check would refuse the next save with *"Care settings changed
  elsewhere."*

The header carries a sync line — *Loading…*, *37 templates · 172 products*,
*Saving…*, *Saved · 1 template*, or the reason it failed. The engine's old
"settings saved in this browser" wording is gone because it is no longer true.

## What the admin edits, and what reaches a report

```
admin maps a product   →  care template "01".."37"  →  HNCSharedCare.resolve()
                                                    →  the report's treatment section
```

The join is the template number. The engine picks a condition, the condition's
`registry.n` becomes `"01"`–`"37"`, and that is the template looked up. One
condition, one template, no fallback — exactly as the client application
behaves.

A product the admin maps carries its own clinical detail: strength,
prescription class, contraindications, directions, duration, and the safety
limits (minimum age, pregnancy, breastfeeding, planning a pregnancy). Those
live on the mapping rather than on the shop product, because whether a
16-year-old or someone pregnant may use a product is a clinical judgement
about *this condition*, and `GeneralProduct` has no such fields.

**The workspace owns the product shape, not the database.** `sync()` assigns a
field per `data-key` in its editor table, so the set grows whenever that table
does. The schema stores products and guidance rows with `strict: false` and
declares no defaults on them — a default would invent a field the workspace
never sent, which both loses nothing visibly and makes an untouched template
compare as changed, climbing its revision on every save.

Saving is a diff: all 37 templates are posted, only the ones that actually
changed are written. Saving an unchanged config three times in a row moves no
revision at all.

The session lives in `sessionStorage`: a refresh keeps you in, closing the tab
signs you out. Signing out reloads the page on purpose — the carried-over
engine takes ownership of the document at startup and was never written to
initialise twice, so a reload is the one way to guarantee the next sign-in
gets a clean workspace.

The workspace is only *mounted* after sign-in, never merely hidden, so the
engine does not start and the care data is not read into the page until
someone is signed in.

## Layout

```
src/
  App.tsx                      the gate: checking, sign-in, then the workspace
  lib/firebase.ts              the Firebase app, and readable error wording
  lib/api.ts                   every call, carrying a fresh Firebase ID token
  api/careWorkspace.ts         the endpoints behind the workspace
  auth/useAdminAuth.ts         Firebase, then the Admin record; and signing out
  workspace/useCareSync.ts     fills the engine's storage, mirrors its saves
  screens/LoginScreen.tsx      the two-panel sign-in screen
  screens/WorkspaceScreen.tsx  hydrates, then loads the engine
  components/WorkspaceFrame.tsx  the frame the engine expects, plus sync + sign-out
  generated/seed.json          the template seed (was <script id="seed">)
  styles/admin.css             the admin stylesheet, unchanged
  styles/shell.css             fixed sidebar, scrolling workspace, sync line
  styles/login.css             the sign-in screen
public/engine/
  admin-app.js                 the original admin application
```

`WorkspaceFrame` is JSX rather than the generated HTML string it used to be,
because the frame now carries React-owned controls (the sign-out buttons) and
a string injected with `dangerouslySetInnerHTML` cannot hold a React handler.
`#main` is still filled that way, which makes its contents opaque to React —
React will not diff what the engine writes there.

## The workspace pages

`templates` · `products`. The templates page carries all **37** care
templates with their male / female / shared pathways, and exporting a mapping
backup remains on that page, where it is used.

*Test client inputs*, *Backup & transfer* and *Workspace guide* were removed
at the client's request.

### The product catalogue

Read-only, and structure only — nothing is wired to a backend. The *Add
product* button and the per-card *Edit product* button are gone; what
replaces them is a search field and a card that shows what a product record
actually holds:

- **Heading** — record number, regulatory class, display name, SKU, brand,
  and badges for publication status and availability.
- **Specification** — strength, form, route, pack size, product type.
- **Chips** — active ingredients, care roles, the diagnosis codes it is
  indicated for, other tags, contraindication tags.
- **Safety limits** — minimum age, pregnancy, breastfeeding, planning a
  pregnancy, and whether clinician approval is required.
- **Hold conditions** — each `when` clause with the reason it holds.
- **Warnings**, then a provenance line: price, commerce ids, review date and
  reviewer, content source, version and last update.

A field with nothing in it is not rendered. Half the catalogue is procedures
and base cleansers with no strength, route or pack size, and a grid of blanks
reads as broken data rather than as a sparse record. *Other tags* also drops
anything the ingredient and role rows have already shown.

The search matches across name, SKU, brand, type, description, warnings,
strength, form, route, pack size, class, ingredients, roles, tags, diagnosis
codes, contraindication tags, availability, commerce ids and reviewer. Every
term typed has to match, so `shampoo scalp` narrows rather than widens. Only
the list is redrawn as you type, so the field keeps focus and the caret stays
put; changing page clears the term, as it does for the template search.

Styles live in `src/styles/catalogue.css`; nothing there redefines a token
from `admin.css`.

## Layout behaviour

The shell is a full-height column — header, the status bar when it has
something to say, then the layout row filling what is left. The sidebar and
the workspace each scroll inside that row, so the header and the page nav
stay put however far down a template table you are. Below 900px the sidebar
becomes a row of pills above the workspace.

## Verified

Against the live database and the real Firebase project, not fixtures.

**The database half**

- The 37 templates rebuild out of Mongo **byte-for-byte identical** to the
  `HNC_DEFAULT_CARE` the engine ships, and pass the engine's own `validate()`.
- A config the engine would reject is refused before it is written
  (`sex: "nonsense"` → *Invalid pathway mapping*).
- Saving an **unchanged** config three times in a row changes nothing and
  moves no revision — no inflation from an idle workspace.
- Changing one template writes exactly that one; the other 36 are untouched.
- Removing a pathway lane removes it. (It did not, at first: `variants` was
  only written when present, so deleting a male pathway appeared to work and
  changed nothing.)

**The workspace half** — the engine booted from database data, no sign-in
needed, so the two halves were proven separately:

- 37 template cards, every id `01`–`37` on the page, PCOS and Androgenetic
  both present, status bar hidden, no console errors.
- The catalogue shows the **real shop**: 172 products, real names and SKUs.
  Search: `onion` → 4, `shampoo` → 69, `zzzz` → the empty state.
- Opening template 18 offers **162 products** — the published, in-stock ones.
- Mapping a real product follows the engine's own gate: *Apply changes*
  answers *"Preview changes before applying this mapping"* until the preview
  has been shown.
- The product lands in `variants.male`, because template 18's pathway is male.
  That is the engine's behaviour, not something added here.

**Both halves joined** — the exact bytes the workspace wrote, captured out of
browser storage and pushed through the API:

- Every field round-trips: `id`, `title`, `sku`, `strength`,
  `prescriptionClass`, `safety`, `contraindications`,
  `requiresClinicianApproval`, `purpose`, `directions`, `duration`, `url`.
  Nothing is dropped and nothing is invented.
- The lane keeps its `sex`, its `enabled` and its guidance.
- A report then resolves it: template 18, male pathway, the mapped product
  present and **held** — *Review the reported safety flags · Underage:
  individual clinical review required · Clinician authorisation pending*.

Three bugs were found by that round trip and fixed: typed sub-schemas were
filling `safety: {}` with five invented values; an `imageUrl` default was
adding a field the workspace never sent; and an empty `durationReview` default
was doing the same to every guidance row, which would have made every save
look like a change.

**Sign-in**, against the real Firebase project:

- The login screen renders with no flash of itself on a refresh.
- A wrong password is refused as *"Email or password is incorrect."* — the
  mapped wording, not a raw Firebase code — and **no API call is made**,
  because step 2 is never reached.
- The workspace is not mounted, so the engine never starts and no care data is
  fetched, until the API has confirmed the account.

**Earlier, and still true:**

- `/` loads the sign-in screen: two panels, email and password and nothing
  else. `#main` is absent and `admin-app.js` has not been requested.
- A wrong password is refused with a readable reason and does not open the
  workspace.
- The right pair opens the workspace: 37 template cards, nav shows exactly
  `templates` and `products`, no console errors.
- The status line is gone — the element is `hidden`, 0px tall, and no
  "configured templates" / "settings saved in this browser" text appears
  anywhere on the page.
- Scrolling the workspace 900px moves the header 0px, the sidebar 0px and the
  document 0px; the document itself does not overflow.
- Both sign-out controls are present, the header shows who is signed in, and
  signing out returns to the sign-in screen with the session cleared.
- Signing back in works on the reloaded page, and the email is case-insensitive.
- The catalogue has no add or edit control and no "Add product" / "Edit
  product" text anywhere on the page; a card renders 268 nodes where it used
  to render 6 fields, with no empty labels and no empty spec values.
- Search was driven for real: by ingredient (`minoxidil` → 1), by SKU
  (`FX-KETO2-SHP` → 1), by diagnosis code (`DX:AGA` → 2), by availability
  (`out of stock` → 1), by two terms that must both match (`shampoo scalp`
  → 2) and by a term that matches nothing (`zzz` → the empty state). The
  field kept focus through every one, and leaving the page cleared it.
- `src/styles/catalogue.css` and the engine's catalogue functions are each
  declared exactly once — the patch that writes them is idempotent and
  re-running it twice leaves the file byte-identical.

## Running it

```sh
npm install
npm run dev       # http://localhost:5190 — pinned, see below
npm run build
npm run preview
```

The dev port is **pinned to 5190** in `vite.config.ts`. The API answers a
browser only from an origin on its CORS allowlist, so a port that moves means
sign-in failing with a bare network error; 5190 is listed in the backend's
`CORS_ADMIN_ORIGIN`. Production needs no entry — the API already trusts any
`https://*.hairsncares.in`.

The backend must be running, and reachable at `VITE_API_BASE_URL`.

## Notes

Storage is browser-local, as in the original: settings persist in
`localStorage` under `hnc.care-template-products.v1`, with the catalogue in
`hnc.offline-catalogue.v2`. When the admin runs inside the combined workspace
it writes through `parent.HNCCareBridge` instead. Backend integration — the
admin API included — is the next phase.
