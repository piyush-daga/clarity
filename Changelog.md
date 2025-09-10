# Changelog

This document tracks sensible, revertible improvements made to the Clarity app.

## [2025-09-07] Five improvements

1) Theme persistence (Settings → Dark mode)
- Change: Persist the theme to `localStorage` (`clarity:theme`) and apply it early during app load to avoid a flash.
- Files: `app/layout.tsx`, `app/settings/page.tsx`
- Revert: Remove the inline script from `app/layout.tsx` and the `localStorage` read/write logic from `app/settings/page.tsx`.

2) Task Details: Stage selector
- Change: Add a Stage dropdown in the Task Details drawer to move tasks between ToDo/In Progress/Done.
- Files: `src/components/TaskDetailsDrawer.tsx`
- Revert: Remove the Stage `<select>` and its state handling from the drawer.

3) Task Details: Color picker
- Change: Add a Color dropdown in the Task Details drawer to set a task color.
- Files: `src/components/TaskDetailsDrawer.tsx`
- Revert: Remove the Color `<select>` and related code.

4) Task Details: Duplicate and Delete actions
- Change: Add buttons to duplicate a task (creates a copy) and delete the current task.
- Files: `src/components/TaskDetailsDrawer.tsx`
- Revert: Remove the Duplicate/Delete buttons and their handlers.

5) Better dialogs: Escape/overlay to close
- Change: Allow closing Quick Add and Task Details by pressing Escape or clicking the backdrop overlay.
- Files: `src/components/QuickAdd.tsx`, `src/components/TaskDetailsDrawer.tsx`
- Revert: Remove the Escape and overlay click handlers from these components.

---

Need to undo a specific change? Each item lists the files to modify. You can also `git revert` the corresponding patch if you’ve committed the changes.

## [2025-09-07] Bonus: Task Details autosave

6) Autosave Task Details
- Change: Edits in the Task Details drawer automatically save after a short pause (debounced). A small "Saving…/Saved" indicator shows progress. The "Save" button is removed since it’s no longer required.
- Files: `src/components/TaskDetailsDrawer.tsx`
- Revert: Remove the autosave `useEffect`, remove the saving state/indicator, and restore the explicit Save button (or re-enable the existing `commit` handler and button).

## [2025-09-07] UX adjustments: calendar and panel

7) Larger calendar by default
- Change: Increased the calendar section in the split view to 70% so it’s more prominent.
- Files: `app/page.tsx`
- Revert: Change the initial `split` back to `55` (or your preferred value).

8) Scrollable calendar area
- Change: Calendar wrapper is scrollable with a thin scrollbar; FullCalendar uses `height="auto"` so it can overflow and scroll.
- Files: `src/components/CalendarView.tsx`
- Revert: Set wrapper to `overflow-hidden` and FullCalendar `height="100%"`.

9) Hide Calendars panel for now
- Change: Removed the left sidebar (`CalendarsPanel`) from the home layout to simplify the UI.
- Files: `app/page.tsx`
- Revert: Re-introduce the left grid column and render `<CalendarsPanel />` again.

10) Cleaner delete control
- Change: Replaced the text Delete button with a trash icon (Lucide) and subtle destructive styling.
- Files: `src/components/TaskDetailsDrawer.tsx`
- Revert: Restore the previous text button labeled "Delete" and remove the icon.

11) Icon buttons for Duplicate and Close
- Change: Replaced the text buttons with icons (Copy and X) with hover titles and accessible labels.
- Files: `src/components/TaskDetailsDrawer.tsx`
- Revert: Replace the icon-only buttons with text labels "Duplicate" and "Close".

12) Fixed calendar width across views
- Change: Prevent width shift when switching between Month/Week/Day by reserving scrollbar gutter and constraining the calendar container width.
- Files: `src/components/CalendarView.tsx`, `src/styles/globals.css`
- Revert: Remove the `calendar-shell` class from the wrapper and delete the `.calendar-shell` CSS rule.

13) Fixed calendar height across views
- Change: Keep the calendar at a constant height across Month/Week/Day by using `height="100%"`, `expandRows`, and a fixed-height container; internal content scrolls as needed.
- Files: `src/components/CalendarView.tsx`
- Revert: Set `height="auto"` on FullCalendar and allow the wrapper to `overflow-auto`.

14) Better time focus and taller calendar
- Change: Make the calendar slightly taller (min height of ~640px), show a live current-time indicator, and auto-scroll Week/Day views to the current time on view change.
- Files: `src/components/CalendarView.tsx`
- Revert: Remove the `min-h-[640px]`, set `nowIndicator={false}`, and remove the `datesSet` handler that calls `scrollToTime`.

15) Seasonal/cultural monthly backgrounds
- Change: Add soft background images per month for all calendar views (Month/Week/Day). Backgrounds are subtle, low-opacity SVGs.
- Files: `src/components/CalendarView.tsx`, `public/backgrounds/month-*.svg`
- Revert: Remove the background overlay div in `CalendarView.tsx` and delete the background SVGs from `public/backgrounds/`.

16) Increase background hue subtly
- Change: Make monthly backgrounds a bit more vivid by slightly increasing overlay opacity and saturation.
- Files: `src/components/CalendarView.tsx`
- Revert: Reduce the overlay `opacity` back to ~0.2 and remove the `filter: 'saturate(1.25)'` style.

17) Rich seasonal/city backgrounds
- Change: Introduced a new set of more detailed SVG backgrounds (waves, skyline, blossoms, snowflakes, lanterns, etc.) and switched the calendar to use them.
- Files: `src/components/CalendarView.tsx`, `public/backgrounds/rich/month-*.svg`
- Revert: Change `bgForMonth` to return `/backgrounds/month-XX.svg` and optionally remove the `public/backgrounds/rich` directory.

18) Global app background (easily revertable)
- Change: Added a fixed overlay that applies the monthly background to the entire app, synced with the calendar’s viewed month.
- Files: `app/layout.tsx`, `src/styles/globals.css`, `src/components/CalendarView.tsx`, `src/lib/app-background.ts`
- Revert: Remove the `<div id="app-bg" ...>` from `app/layout.tsx`, delete the `.app-bg` CSS in `globals.css`, and remove the calls to `setAppBackgroundByDate` in `CalendarView.tsx`.

19) Neutralize card color accents
- Change: Removed the small color dot from task cards in the ToDo/In Progress/Done board so colors don’t clash with the new global background. Calendar event colors remain intact.
- Files: `src/components/TaskCard.tsx`
- Revert: Re-introduce the color dot by importing `colorToTailwind` and rendering the colored `<span>` next to the title.

20) Subtle event color-coding (calendar only)
- Change: Calendar events no longer use filled colors; instead they render a thin top border matching the task’s color for a clean, readable UI.
- Files: `src/components/CalendarView.tsx`, `src/styles/globals.css`
- Revert: In `CalendarView.tsx`, map event color back to the `color` property and remove `eventDidMount`; delete the `.fc-event-minimal` CSS.

21) Calendar interactions and consistent backgrounds
- Change: Clicking an event on the calendar opens the Task Details drawer. Backgrounds are now consistent across Month/Week/Day for a given anchor date, using the calendar API’s current date instead of view range starts.
- Files: `src/components/CalendarView.tsx`, `src/components/TaskBoard.tsx`
- Revert: Remove the `eventClick` handler and the `open-task-details` event wiring; revert `datesSet` to use `view.currentStart` if desired.

22) Auto-show tasks on calendar when timed
- Change: Removed the "Show on calendar" concept. Any task with a start/end time automatically appears on the calendar; toggles were removed from Task details and task cards.
- Files: `src/components/CalendarView.tsx`, `src/components/TaskDetailsDrawer.tsx`, `src/components/TaskCard.tsx`, `src/components/TaskBoard.tsx`
- Revert: Reintroduce event filtering by `isEvent` and add the toggle back to Task Details and Task Card.

23) Colored task cards with readable text
- Change: Task cards now use a soft background hue when a color is selected, with matching border and readable text.
- Files: `src/components/TaskCard.tsx`
- Revert: Replace the dynamic hue classes with the neutral `card` class and remove `cardHueClasses` usage.

24) Dark mode polish + theme previews
- Change: Improved dark mode styles for cards, inputs, buttons, and scrollbars. Added card-based light/dark previews in Settings to choose the theme, with persistence.
- Files: `src/styles/globals.css`, `app/settings/page.tsx`
- Revert: Remove the dark-specific CSS rules and the ThemeCard preview UI in Settings.

25) Remove dark mode completely
- Change: Removed dark mode CSS variants, theme persistence, and the theme preview UI. The app now renders in a single light theme.
- Files: `src/styles/globals.css`, `app/layout.tsx`, `app/settings/page.tsx`, `src/components/TaskBoard.tsx`, `src/components/TaskCard.tsx`
- Revert: Reapply the previously added dark mode CSS, restore the inline dark-class script in `app/layout.tsx`, and bring back the theme previews in Settings.

## [2025-09-07] Helpful improvements

26) Global search for tasks/events
- Change: Added a header search field to filter tasks on the board and events on the calendar by title/description.
- Files: `src/components/Header.tsx`, `src/components/TaskBoard.tsx`, `src/components/CalendarView.tsx`, `src/store.ts`
- Revert: Remove the search input from the header and the `search` state in the store; delete filtering logic in board and calendar.

27) Persist calendar/board split
- Change: Remembers the calendar-vs-board height split across reloads using localStorage.
- Files: `app/page.tsx`
- Revert: Remove the `clarity:split` read/write effects.

28) Safer delete + feedback
- Change: Added a confirmation prompt before deleting a task and toasts for duplicate/delete actions.
- Files: `src/components/TaskDetailsDrawer.tsx`
- Revert: Remove the confirm and toast calls.

29) Overdue indicator
- Change: Tasks that have an end time in the past and are not completed show a small "Overdue" badge.
- Files: `src/components/TaskCard.tsx`
- Revert: Remove the `isOverdue` logic and badge.

30) CSV import
- Change: Added a simple CSV importer in Settings (id,title,stage,start,end,checked,color,parentId,calendarId). Creates tasks locally.
- Files: `app/settings/page.tsx`
- Revert: Remove the Import CSV button/handler.

31) Dark text for calendar events
- Change: Force dark text color on calendar events for better readability against light backgrounds.
- Files: `src/components/CalendarView.tsx`
- Revert: Remove the explicit `el.style.color` assignment in `eventDidMount`.

32) High-contrast calendar event background
- Change: Ensure calendar events render on a semi-opaque white chip with a colored top border, avoiding hard-to-read combinations (e.g., red). Title/time inherit dark text for readability.
- Files: `src/components/CalendarView.tsx`, `src/styles/globals.css`
- Revert: Set the event background back to `transparent` and remove the `.fc-event-minimal` tweaks.

33) Full-card dragging to calendar
- Change: Drag the entire task card from the board onto the calendar to schedule it. Kanban reordering still works with a small activation distance to reduce conflicts.
- Files: `src/components/TaskCard.tsx`, `src/components/CalendarView.tsx`
- Revert: Use a dedicated drag handle instead of the whole card.

35) Event chip aesthetic improvements
- Change: Rounded corners, subtle shadow, compact padding, and hover lift on calendar events for a cleaner, more tactile look. Titles/time are ellipsized to prevent overflow.
- Files: `src/styles/globals.css`
- Revert: Remove the additional styles on `.fc-event-minimal` (radius, shadow, padding, hover).

36) Double-click to create tasks on calendar
- Change: Double-clicking a date/time on the calendar creates a new task (9–10am by default in Month view, +1 hour in Week/Day). The Task Details drawer opens immediately for quick editing.
- Files: `src/components/CalendarView.tsx`
- Revert: Remove the `dateClick` handler or gate creation behind a setting.

37) Subtask count pill on events
- Change: Calendar events now display a small pill inside the event title showing completed/total subtasks (e.g., 2/5) when subtasks exist.
- Files: `src/components/CalendarView.tsx`, `src/styles/globals.css`
- Revert: Remove the `subTotal/subDone` extended props and the `.fc-pill` creation from `eventDidMount`; delete the `.fc-pill` CSS.

38) Week view default + reactive subtask rendering
- Change: Calendar opens in Week view by default. Event content is rendered via `eventContent` so subtask pills update immediately after edits. Subtask edits now persist instantly from the drawer.
- Files: `src/components/CalendarView.tsx`, `src/components/TaskDetailsDrawer.tsx`
- Revert: Set `initialView` back to `dayGridMonth`, remove `eventContent`, and revert subtask editor to local-only changes.

39) 4-Day default, hover time, wrapping titles, and stage colors
- Change: Added a 4‑day view and made it the default. Event titles no longer show time inline; time appears on hover via native tooltip. Titles wrap to multiple lines. Colors are standardized by stage (ToDo: yellow, In Progress: blue, Done: green) on both the board cards and calendar event border. Done tasks are shown with a strikethrough in both places.
- Files: `src/components/CalendarView.tsx`, `src/components/TaskCard.tsx`, `src/styles/globals.css`
- Revert: Set `initialView` back to another view, remove the custom views, restore inline time in `eventContent`, revert text wrapping CSS, and switch color mapping to use task color if desired.

34) Remove decorative right-side checkbox icon
- Change: The extra CheckSquare icon on the right side of task cards has been removed to reduce visual clutter. The left checkbox remains for marking tasks done.
- Files: `src/components/TaskCard.tsx`
- Revert: Reintroduce the `<CheckSquare>` icon and its import from `lucide-react`.

40) Show event time only on hover
- Change: Removed inline time from calendar event chips. Time was accessible on hover (native tooltip), and the inline time label appeared only while hovering the event card.
- Files: `src/components/CalendarView.tsx`, `src/styles/globals.css`
- Revert: Historical note (superseded by #41).

41) Time footer on events + wrapping titles
- Change: Display the event time in a small footer at the bottom of each calendar card, with a subtle divider. Titles now wrap naturally instead of truncating.
- Files: `src/components/CalendarView.tsx`, `src/styles/globals.css`
- Revert: Remove the footer block from `eventContent`, restore the previous inline time rendering, and delete the `.fc-event-minimal .fc-event-main { display:flex; ... }` rule.

42) Release polish: PWA/SEO/A11y + Node engines
- Change: Improved metadata and icons for PWA/SEO, added `robots.txt` and a generated `sitemap`, accessible labels for search and quick add, and an aria-label for calendar events. Declared Node engine requirements and added `.nvmrc` (Node 20) for dependable builds.
- Files: `app/layout.tsx`, `app/sitemap.ts`, `public/robots.txt`, `.nvmrc`, `package.json`, `src/components/Header.tsx`, `src/components/QuickAdd.tsx`, `src/components/CalendarView.tsx`, `README.md`
- Revert: Remove the metadata additions, delete `app/sitemap.ts`/`public/robots.txt` and `.nvmrc`, and revert the a11y label changes.

43) Subtasks UI: icon buttons + ordering
- Change: Replaced textual "Add/Remove" with icon buttons (Plus for add, Trash for delete). Completed subtasks automatically move to the bottom and render with a strike‑through. Adjusted padding for a cleaner, consistent look.
- Files: `src/components/TaskDetailsDrawer.tsx`
- Revert: Restore the previous text buttons and remove the sorting/strike‑through logic in `SubtasksEditor`.

44) Subtasks polish: motion, sizing, and background
- Change: Added a smooth FLIP animation when subtasks re-order after being marked done; increased checkbox size to match the UI scale; and applied the app’s monthly background behind the Task Details drawer for visual consistency.
- Files: `src/components/TaskDetailsDrawer.tsx`, `src/styles/globals.css`
- Revert: Remove the FLIP animation code and `.checkbox-xl` CSS; delete the background overlay element in the drawer container.

45) Responsive Task Details drawer
- Change: Drawer behaves as a right-side panel on medium+ screens and a bottom sheet on small screens (rounded top). Overlay click-to-close is fixed to avoid accidental immediate close.
- Files: `src/components/TaskDetailsDrawer.tsx`
- Revert: Remove responsive classes (`md:*`) and restore a fixed right-side layout.

46) Revert: Remove background inside Task Details
- Change: Removed the internal background layer from the Task Details drawer to restore the prior clean panel that slides in from the right.
- Files: `src/components/TaskDetailsDrawer.tsx`
47) Remove color concept entirely
- Change: Removed color from Tasks across the UI and data flows. No color parsing in Quick Add, no color selector in Task Details, and no color column in CSV export/import. Database migrates older installs to drop the `color` column.
- Files: `src/types.ts`, `src/components/TaskDetailsDrawer.tsx`, `src/components/QuickAdd.tsx`, `src/lib/nlp.ts`, `src/lib/export.ts`, `app/settings/page.tsx`, `src/lib/db.ts`, `workers/db.worker.ts`
- Revert: Re-add the color field in `types.ts`, reintroduce parsing/UI, include the column in CSV, and remove the migration.

48) Subtasks: Enter to add
- Change: Pressing Enter while editing a subtask creates a new subtask. Works alongside icon Add; checked items still move to the bottom with animation.
- Files: `src/components/TaskDetailsDrawer.tsx`
- Revert: Remove the `onKeyDown` handler on subtask inputs.
