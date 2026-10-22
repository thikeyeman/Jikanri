# How the application fits together

## Why put it in a browser?

The problem I wanted to solve did not need accounts or a shared database. I needed somewhere to enter hours, see the totals, and try possible schedules. A browser can do those things on its own.

Plain HTML, CSS, and JavaScript are enough for the current interface. I can follow a button from its event handler to the calculation it uses without going through a framework. React or a backend would be reasonable for a different project, but neither is needed just to make these forms and calculations work.

That does not make this approach better for everything. The browser handles the interface, storage, and solving. The synchronous solver can briefly block input, and data does not automatically follow me to another device.

## How the JavaScript files work together

There is no build step. `index.html` loads the scripts in order, and they share functions and a store object:

- `config.js` holds defaults and the current proposal state.
- `storage.js` saves, validates, restores, and migrates stored data.
- `jobs.js` handles job IDs, settings, and scheduling eligibility.
- `tracker.js` calculates totals and the limits that apply to a date or week.
- `availability.js` checks weekdays, ranges, and date exceptions.
- `optimizer.js` builds and solves the schedule, checks it, and applies accepted hours.
- `visualization.js` draws the monthly SVG chart. `app.js` connects the controls and updates the page.

For an ordinary edit, the event handler updates the store, saves it, clears an old proposal, and redraws what changed. Shared state makes this fairly easy to follow, but it also means script order matters. This is a trade-off I can manage in a project this size.

The browser loads the solver directly from `vendor/`. It does not need npm, a package install, or a CDN. Users can open `index.html` or use the hosted site. Generating a standalone HTML export needs HTTP access to the assets so it can embed them; opening the source file directly may block that fetch. There is no service worker or automatic offline cache.

## Store hours under job IDs

The current store uses schema version 7. Each job has a stable ID, a name, a color, limits, availability, monthly overrides, and status flags. Recorded hours are grouped by local date, then by job ID. Changing “Café” to another name therefore does not move its records.

Dates are `YYYY-MM-DD` strings. Date navigation uses local calendar dates rather than converting through UTC.

The global daily and rolling limits count all jobs. Each job has its own daily, Sunday–Saturday weekly, and monthly caps, minimum block, and availability. A monthly override replaces only the fields it contains; the rest still use defaults.

Editing a job does not select it for optimization. The editor moves below its job row, while the planner keeps its own target. Only scheduling-enabled, unarchived jobs can receive suggestions.

## Why archived jobs still count

Leaving a job on Friday should not erase Thursday's hours from the next seven-day window. Archiving keeps the job ID and its records. Those hours still count in combined calculations and appear in the monthly overview when that month contains work for the job. Historical hours remain editable.

## Keep suggestions separate

Recorded hours are work entered as actual commitments. Suggestions are possibilities, so I keep them in `lastPlan` with the solver's result information instead of writing them straight into the records.

That is why a proposal can appear on the calendar without increasing the recorded monthly total. Applying it is a separate action, and the code checks it against the current settings and records first. It adds hours only to the selected job.

Even applying one date clears the remaining proposal. Its projections may no longer be current. Availability also stays separate from historical entry: an unavailable weekend should stop a suggestion, not prevent me from recording work that actually happened.

## What happens to saved data?

The storage adapter uses `localStorage` keys under `jikanri:v1:`. Supported older Jikanri backups can migrate to the current format. Imported data is validated before replacement. If saved data is corrupt, the original is retained separately; if storage is unavailable, changes stay in memory and the app shows a warning.

Local storage is convenient, but clearing browser data can remove records. Tabs and devices do not synchronize automatically. I therefore keep JSON export and restore available. Import replaces the current store after confirmation; it does not merge two histories. Undo/redo and up to 40 recovery snapshots use the same store format. Real JSON and standalone HTML exports contain records and should stay private.

## Let people try it without their own records

The demo has a fictional October schedule. Entering it keeps the normal in-memory store and switches the storage adapter to a separate `Map`. Demo edits and recovery actions go there. Exit restores the normal session; refresh starts from normal saved storage again.

This separates demo changes from normal application data. It is not encryption or access control. An export made in demo mode contains fictional data; a normal export contains the user's records.

## What I am accepting by keeping it small

There are no accounts, server APIs, cloud sync, or required installation for basic use. That keeps the project small enough for me to understand, but puts backup responsibility on the user and limits use across devices. I keep development tests and tools locally; they are not part of the public application. [OPTIMIZER.md](OPTIMIZER.md) explains the scheduling calculations and what they can and cannot tell me.
