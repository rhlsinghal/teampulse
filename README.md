# TeamPulse v2 — Setup & Deployment Guide

A team standup tracker with Google Sign-In, Firebase-managed access control, monthly/annual reports, AI assistant, and blocker tracking.

---

## What's in this app

**For team members:**
- Daily standup form (yesterday / today / blockers / tasks with client tagging)
- Submission streak tracker
- Personal history with calendar navigation

**For manager (you):**
- Team overview — see who submitted today, who hasn't, active blockers
- Click any member card to view their profile with stats and heatmap
- Blocker tracking — all open/resolved blockers across the team with "Mark resolved"
- Monthly reports — per-employee task breakdown with CSV export
- Annual reports — full year summary with AI-generated performance narrative
- AI assistant — ask anything about team updates in plain English
- Allowed users — manage exactly who can log in (no code changes needed)

---

## Step 1 — Firebase setup (one time)

### 1a. Create project
1. Go to https://console.firebase.google.com
2. Add project → name it `teampulse` → continue through setup

### 1b. Enable Firestore
1. Left sidebar → Firestore Database → Create database
2. Choose **Production mode** → pick your region → Done

### 1c. Set Firestore security rules
Firestore → Rules tab → replace everything with this → Publish:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /allowedUsers/{email} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && exists(/databases/$(database)/documents/allowedUsers/$(request.auth.token.email))
        && get(/databases/$(database)/documents/allowedUsers/$(request.auth.token.email)).data.role == "manager";
    }

    match /standup/{member}/entries/{date} {
      allow read, write: if request.auth != null
        && exists(/databases/$(database)/documents/allowedUsers/$(request.auth.token.email));
    }

    match /monthlySummaries/{docId} {
      allow read, write: if request.auth != null
        && exists(/databases/$(database)/documents/allowedUsers/$(request.auth.token.email));
    }
  }
}
```

### 1d. Enable Google Sign-In
Authentication → Get started → Google → Enable → Save

### 1e. Register web app & copy config
Gear ⚙ → Project Settings → Your apps → `</>` (Web) → register as `teampulse-web`
Copy the 6 values from the `firebaseConfig` block shown.

### 1f. Seed your own email as manager (ONE TIME ONLY)
In Firebase Console → Firestore → Start collection → Collection ID: `allowedUsers`

Add document:
- Document ID: `your-email@company.com`
- Fields:
  ```
  name:    "Your Name"
  email:   "your-email@company.com"
  role:    "manager"
  addedOn: "2026-01-01"
  active:  true
  ```

After this, you log in and add all other team members from the **Allowed Users** tab in the app. No more manual Firebase editing needed.

---

## Step 2 — GitHub setup

### 2a. Create repository
1. https://github.com/new → name: `teampulse` → Public → Create

### 2b. Update homepage URL
Open `package.json` and replace `YOUR-GITHUB-USERNAME`:
```json
"homepage": "https://YOUR-GITHUB-USERNAME.github.io/teampulse"
```

### 2c. Upload project files
Upload all files to the repository (drag & drop or git push).

### 2d. Add Firebase secrets
Repo → Settings → Secrets and variables → Actions → New repository secret

Add all 6:
| Secret | Value |
|---|---|
| `FIREBASE_API_KEY` | your `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | your `authDomain` |
| `FIREBASE_PROJECT_ID` | your `projectId` |
| `FIREBASE_STORAGE_BUCKET` | your `storageBucket` |
| `FIREBASE_MESSAGING_SENDER_ID` | your `messagingSenderId` |
| `FIREBASE_APP_ID` | your `appId` |

### 2e. Authorise GitHub Pages domain in Firebase
Firebase Console → Authentication → Settings → Authorised domains → Add:
```
YOUR-GITHUB-USERNAME.github.io
```

### 2f. Enable GitHub Pages
Repo → Settings → Pages → Source: Deploy from branch → Branch: `gh-pages` → / (root) → Save

---

## Step 3 — Deploy

Push any change to `main`. GitHub Actions builds and deploys automatically (~2 mins).

Your app will be live at:
```
https://YOUR-GITHUB-USERNAME.github.io/teampulse
```

---

## Adding team members (ongoing)

1. Log in to the app with your manager account
2. Go to **Allowed Users** tab
3. Click **+ Invite user**
4. Enter their name, email, and role → Add user
5. Share the app URL with them — they can log in immediately with their Google account

---

## How data is stored in Firestore

```
allowedUsers/
  {email}                     ← who can log in and their role

standup/
  {memberName}/
    entries/
      {YYYY-MM-DD}            ← one document per day per member

monthlySummaries/
  {memberName}_{YYYY-MM}      ← auto-generated monthly aggregate
                                 (used for fast annual report queries)
```

---

## Annual review notes

- Data persists indefinitely — all standups from day one are stored
- Monthly summaries are auto-generated when a member submits their update
- Annual report queries use pre-aggregated monthly summaries (not raw daily data)
  so they remain fast even after a full year of entries
- The AI annual narrative is generated fresh each time using the monthly summaries
- If an employee leaves, their historical data remains for review purposes
- New employees joining mid-year will have their review cover from their join date

---

## Firestore usage estimates (free Spark plan limits)

| Metric | Estimate (10 people, 1 year) | Free limit |
|---|---|---|
| Documents | ~2,500 daily entries + 120 monthly summaries | 1,000,000 |
| Reads/day | ~500-1000 | 50,000 |
| Writes/day | ~50-100 | 20,000 |

You are well within the free tier for a 10-person team across the full year.

---

## Project structure

```
teampulse/
├── .github/workflows/deploy.yml
├── public/index.html
├── src/
│   ├── App.jsx                        ← main router + auth gate
│   ├── firebase.js                    ← Firebase config (uses env vars)
│   ├── index.js
│   ├── styles.css                     ← global design system
│   ├── components/index.jsx           ← shared UI components
│   ├── hooks/
│   │   ├── useAuth.js                 ← Firebase-managed auth
│   │   └── useHistory.js              ← standup data load/save
│   ├── utils/
│   │   ├── constants.js               ← colours, bandwidth, status
│   │   ├── dates.js                   ← date helpers
│   │   └── aggregator.js             ← monthly/annual aggregation
│   └── pages/
│       ├── member/
│       │   ├── TodayUpdate.jsx
│       │   └── MyHistory.jsx
│       └── manager/
│           ├── TeamOverview.jsx
│           ├── MemberProfile.jsx
│           ├── Blockers.jsx
│           ├── MonthlyReports.jsx
│           ├── AnnualReport.jsx
│           ├── AIAssistant.jsx
│           └── AllowedUsers.jsx
└── package.json
```
