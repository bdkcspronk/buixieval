# BUIXIEVAL — Out Back 2027

Promo site for a week-long outback-themed event (12–18 April 2027) with sign-ups,
teams, donations and a live tally.

## Stack

- **Vite + vanilla JS** — static multi-page site
- **Firebase** (free Spark plan) — Firestore for data, Auth for member/admin logins (Google + email/password), Hosting for the site
- **Revolut** (personal, via revolut.me) and/or bank transfer for payments

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | Hype, countdown, live tally (collective goals, team race, top donors) |
| `events.html` | Day-by-day lineup with live "X going" counts |
| `team.html?team=blue` / `?team=pink` | Team page: every member as a block sized by how much they've donated |
| `signup.html` | Log in, then pick name, team and days; afterwards your account page (donations, rewards, edit details) |
| `donate.html` | Rewards menu, pledge form (login required), then Revolut / IBAN payment details with a reference |
| `admin.html` | Confirm/reject donations, member rewards, members (move team, CSV export), teams, payment details & goals |

## Accounts

Members log in with Google or email/password. Their profile lives at `members/{uid}` and every
donation stores the donor's `uid`, so totals and rewards always add up per person.
Members can edit their name and days; only admins can move someone to another team.

Members can upload a JPG/PNG picture from their account page (with a preview to confirm first).
The browser shrinks it to a ~30–60 KB JPEG stored in `memberPhotos/{uid}` in Firestore —
no Firebase Storage needed, so the free Spark plan still covers everything. Admins can remove
pictures from the members table.

## How donations work

Personal Revolut accounts can't notify a website about payments, so:

1. A logged-in member fills in the form → a **pending** pledge is saved with a reference like `BX-7K2QF`.
2. They pay via revolut.me or bank transfer and put the reference in the note.
3. An admin checks Revolut and clicks **Confirm** on the admin page.

Only confirmed donations count toward the tally, team totals, goals and rewards.

## Local development (no Firebase project needed)

Needs Java 21+ for the emulators.

```bash
npm install
npm run emulators   # terminal 1 — local Firestore + Auth, UI at http://127.0.0.1:4000
npm run dev         # terminal 2 — http://localhost:5173 (uses .env.development.local)
```

The emulator starts empty each time. To use the admin page locally: in the emulator UI,
add a user under **Authentication**, then add a document in Firestore at `admins/<that user's UID>`.
Log in at `/admin.html` and click **Add default teams**.

## Going live

1. Create a project at https://console.firebase.google.com (free Spark plan is enough).
2. Enable **Firestore Database** (production mode) and under **Authentication → Sign-in method**
   enable **Email/Password** and **Google**. If you add a custom domain later, add it under
   **Authentication → Settings → Authorized domains** (the `*.web.app` domain is already allowed).
3. Add a **Web app** in Project settings and copy its config into `.env.production.local`
   (see `.env.example`).
4. Deploy:
   ```bash
   npx firebase login
   npx firebase use --add        # pick your project
   npm run deploy                # builds and deploys hosting + Firestore rules
   ```
   The site is then live at `https://<project-id>.web.app`.
5. Log in on the site once (Google or email), then find your account under
   **Authentication → Users**, copy its UID, and create a Firestore document `admins/<UID>`.
6. Log in at `/admin` and fill in your Revolut username / IBAN when the account exists.
   Goals, rewards and the two team names are editable there too. The teams themselves
   (Blue and Pink) are built in, so there's nothing to create.

## Editing content

- Schedule: `src/js/schedule-data.js`
- Default goals, team goal and individual rewards: `src/js/store.js` (overridden by whatever
  is saved on the admin page)
- Security rules: `firestore.rules`
