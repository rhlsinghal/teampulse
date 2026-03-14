# 🚀 TeamPulse — Deployment Guide

A team standup tracker with Google Sign-In, persistent history via Firebase, deployed on GitHub Pages.

---

## Step 1 — Set up Firebase (5 minutes)

1. Go to **https://console.firebase.google.com**
2. Click **"Add project"** → name it `teampulse` → click through setup
3. Once inside, click **"Firestore Database"** in the left sidebar
4. Click **"Create database"** → choose **"Start in production mode"** → pick your region → Done
5. Go to **Firestore → Rules** and paste these rules then click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /standup/{member}/entries/{entryId} {
      allow read, write: if request.auth != null
        && request.auth.token.email.matches('.*@yourcompany\\.com');
    }
  }
}
```
Replace yourcompany.com with your actual domain.

6. Enable Google Sign-In:
   - Left sidebar → Authentication → Get started
   - Click Google → toggle Enable → Save

7. Gear icon ⚙ → Project Settings → Your apps → click </> (Web) → register as teampulse-web
8. Copy the 6 firebaseConfig values for Step 4

---

## Step 2 — Customise the app

Open src/App.jsx and update the 3 lines at the top:

```js
const ALLOWED_DOMAIN = "yourcompany.com";
const MANAGER_EMAILS = ["you@yourcompany.com"];
const TEAM_MEMBERS   = ["Alice", "Bob", ...];  // use your team's first names
```

Team member names must match the first name on each person's Google account.

---

## Step 3 — Create GitHub Repository

1. https://github.com/new → name: teampulse → Public → Create
2. Upload all project files
3. In package.json update the homepage URL with your GitHub username:
   "homepage": "https://YOUR-GITHUB-USERNAME.github.io/teampulse"

---

## Step 4 — Add Firebase secrets to GitHub

Repo → Settings → Secrets and variables → Actions → New repository secret

| Secret Name                    | Value                  |
|--------------------------------|------------------------|
| FIREBASE_API_KEY               | your apiKey            |
| FIREBASE_AUTH_DOMAIN           | your authDomain        |
| FIREBASE_PROJECT_ID            | your projectId         |
| FIREBASE_STORAGE_BUCKET        | your storageBucket     |
| FIREBASE_MESSAGING_SENDER_ID   | your messagingSenderId |
| FIREBASE_APP_ID                | your appId             |

---

## Step 5 — Authorise your GitHub Pages domain in Firebase

Firebase must know your GitHub Pages URL is a trusted sign-in origin or the Google popup will be blocked.

1. Firebase Console → Authentication → Settings → Authorised domains
2. Add domain: YOUR-GITHUB-USERNAME.github.io

---

## Step 6 — Enable GitHub Pages

Repo → Settings → Pages → Source: Deploy from a branch → branch: gh-pages → / (root) → Save

---

## Step 7 — Deploy

Push any change to main. GitHub Actions builds and deploys automatically.

Live URL: https://YOUR-GITHUB-USERNAME.github.io/teampulse

---

## Access behaviour

| Who opens the app          | What happens                                      |
|----------------------------|---------------------------------------------------|
| Team member (@yourcompany) | Signs in with Google → lands on their standup     |
| Manager                    | Same + sees Manager View tab                      |
| Anyone outside the domain  | Signs in → Access Denied screen                   |
| Unauthenticated API call   | Blocked by Firestore rules (double protection)    |

---

## Project Structure

```
teampulse/
├── .github/workflows/deploy.yml   <- auto-deploys on push to main
├── public/index.html
├── src/
│   ├── App.jsx                    <- edit ALLOWED_DOMAIN, MANAGER_EMAILS, TEAM_MEMBERS here
│   ├── firebase.js                <- uses GitHub Secrets via env vars
│   └── index.js
├── package.json                   <- update homepage URL here
└── README.md
```
