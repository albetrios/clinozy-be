# Self-check & report

- [x] Every popup names a concrete shape, and states mobile separately (phone and, where it differs, tablet)
- [x] Every layout table has a filled Mobile column — phone < 760px and tablet 760–1099px are designed in the prototype; no mobile field is n/a
- [x] Every multi-step flow answers "sequence varies by input?" explicitly, including what changes on phone (Week not offered; lead drawer one pane at a time; Roles one pane at a time)
- [x] Every list says table or cards, and what it does on phone (tables keep the primary cell + one key column, fold up to 4 values into the meta line, hide header, footer and checkboxes, and put row actions on their own line — rows, not cards)
- [x] Every user-visible string is quoted verbatim from the prototype
- [x] Every icon has a Lucide name (brand glyphs — WhatsApp, Instagram — are named as such)
- [x] Every surface has loading, empty and error
- [x] No adjective stands where a number belongs
- [x] Every blank field is n/a with a reason

Preset: done. Screens specified: 12. Fields marked n/a: 218. Gaps I could not resolve: the phone tab bar renders below the 100%-high app grid in a plain browser (the CSS intends it as the third grid row; specified as intended); the Visit sheet has no phone layout and overflows by about 30px at 390px; on phone the New lead and appointment-form drawers lose their top close button (only right-anchored × buttons are repositioned); the delete confirm stays a min(480px, 100vw − 56px) side drawer on phone; the upload tray and the contact / team hover cards have no phone rule; the patient file's Overview bento exists in the markup but nothing opens it; the "New task" drawer and the stacked "New offering" drawer's steps cannot be reached or advanced; Day close › Review never fills its State and actions cells; the review history icon `star` and the Browse × icon `x` are missing from the icon registry; notifications, an organization switcher and security / billing / devices shortcuts are not in the design (placements suggested in shell.md); routes are taken from `schema-routes.md` — the prototype is a single page and determines no URL.
