# The 9 Missing Workflows — Explained in Plain English

No technical jargon here. Each one explained with everyday language and real-world
comparisons, plus what it means for you and your users.

---

## 1. Quota & Billing System

**What it is in plain words:**
Right now, anyone who uses the app can search and download leads **as much as they want,
for free, forever**. There's no limit and no way to pay for more.

The Quota & Billing system would add **membership plans** (like Netflix's Basic / Standard /
Premium):

- A **Free** plan: a small daily allowance — e.g. a few searches a day and a few downloads.
- Paid **Starter / Growth / Pro** plans: bigger allowances, or unlimited, for a monthly fee.

**Why it matters:**
This is how the product makes money. If nobody is ever forced to hit a limit, nobody ever
pays. The whole "free leads" business model depends on you running out of free searches and
being offered the upgrade.

**Real-world analogy:**
A free-to-play mobile game. You get a few "lives" or "energy points" for free. When you run
out, you wait — or pay to get more immediately. Same idea: free users get a small taste,
paid users get the full experience.

**In this repo right now:**
There is no "plan" concept at all. A new user and a paying user are treated identically.
The `is_paid` check in the code just means "is this person an admin?" — it has nothing to do
with actually paying.

**What we'd build:**
- A database table of the membership plans (name, price, how many searches/downloads allowed).
- A record of who has signed up for which plan.
- A daily counter that says "this user did X searches today" and stops them when they hit the cap.
- A PayPal connection so people can actually pay and upgrade.

---

## 2. Server-Side, Gated Export

**What it is in plain words:**
"Export" = the button that lets someone download leads as a file (like CSV for Excel).

The problem: **in the current app, that download is built on the user's own computer
(their browser), completely outside the app's server.** The app never gets to say "yes" or
"no". Any logged-in user can save whatever they see, no matter their plan.

**Why it matters:**
Two big reasons:

1. **It's a revenue leak.** If export is the "paid feature," and it's free and unlimited in
   the browser, nobody needs to pay.
2. **It's a data-leak risk.** Your whole leads database is your valuable asset. If export
   has no limits, someone could slowly save your entire dataset for nothing.

**Real-world analogy:**
It's like a museum where the "premium tour" booklet is free to print on any printer in the
building. The museum never controls who prints, how much, or how often. You'd want every
booklet printed to go through the front desk so you can decide who gets one.

**In this repo right now:**
The server does have an export endpoint, but the website's export button doesn't use it —
it builds the file in the browser instead. So the server-side protection is effectively
switched off.

**What we'd build:**
- Make the export button call the app's server.
- The server then checks: is this person logged in? On a paid plan? Within their download
  limit? Then it creates the file safely and sends it back.
- Keep a record of every download so you can see who exported what.

---

## 3. Dedup Engine (duplicate detection)

**What it is in plain words:**
Dedup = **finding and removing duplicate leads** so the same business doesn't appear twice
in the database.

**Why it matters:**
If you upload a list of leads twice, you currently get two copies of everything. Duplicates:

- make search results confusing (the same person shows up 3 times),
- inflate your "we have 50 million leads" claim (many are repeats),
- waste a user's download allowance on the same record twice.

**Real-world analogy:**
A phone contacts list where, after syncing, you have the same friend saved as "John Smith,"
"John S.," and "Johnny Smith." Dedup is the tool that spots all three are the same person
and keeps one clean entry.

**In this repo right now:**
There's no duplicate detection at all. Import the same CSV twice and you get doubled data.

**What we'd build:**
- When importing leads, the app creates a fingerprint for each one (based on the email).
- It remembers every fingerprint it has ever seen.
- Before adding a new lead, it checks: "have I seen this fingerprint before?" If yes, it
  skips it.
- An admin tool to scan the whole database for duplicates and clean them up (see a preview
  first, then mark or remove them).

---

## 4. External Ingest API (letting other programs feed in leads)

**What it is in plain words:**
An "API" here is a way for **another computer program** to talk to your app. The Ingest API
would let an outside system (like a scraper, or a supplier of lead data) **push leads
directly into your database** automatically — without a human clicking "upload" each time.

**Why it matters:**
This is how you grow a huge leads database efficiently. But you can't let just anyone do
it — otherwise strangers could flood your database with junk or steal from it. So it needs
a strong "secret handshake" to prove the sender is you.

**Real-world analogy:**
A delivery gate at a warehouse. The external system is the delivery truck. The Ingest API
is the loading dock. But you don't want random cars driving in — so the truck must show a
signed ID card, a valid time-stamp, and proof it hasn't made this delivery before. Only
then does the gate open.

**In this repo right now:**
There's no such entry point. Data can only come in through a human using the admin upload
screen.

**What we'd build:**
- A special secure URL that only authorized programs can call.
- A digital signature check so the app can confirm the message truly came from you.
- A rule that each message is fresh (recent timestamp) and can't be replayed twice.

---

## 5. Google OAuth Login ("Sign in with Google")

**What it is in plain words:**
The button that says **"Continue with Google"** instead of typing a username and password.

**Why it matters:**
It makes signing up far easier (one click, no password to remember), and it was a feature in
the old WordPress version — so removing it made the app harder to use than before.

**Real-world analogy:**
Instead of filling out a paper sign-up form at a club, you just show your government ID and
they let you in. Google is that ID — it confirms who you are so the app doesn't have to ask
for a password.

**In this repo right now:**
Login is email + password only. There's no "Sign in with Google" option.

**What we'd build:**
- A "Continue with Google" button on the login and sign-up pages.
- A secure connection to Google's login service (in the background).
- When someone logs in with Google for the first time, the app automatically creates an
  account for them (no need to set a password).

---

## 6. Working Audit Log (an activity diary)

**What it is in plain words:**
An **activity diary** that records important things that happen — who logged in, who failed
to log in, who downloaded leads, who changed someone's role.

**Why it matters:**
If something goes wrong (a suspicious login, a big data download, an account that got
hacked), you need a record to look back at and find out what happened. Without it, you're
blind after the fact. It's also needed for legal/compliance reasons.

**Real-world analogy:**
A bank's transaction history. The bank keeps a record of every deposit and withdrawal so it
can investigate fraud and answer questions later. The audit log is that transaction history,
but for your app's actions instead of money.

**In this repo right now (the odd part):**
The database already has a table made for this diary — but **nothing ever writes to it**.
It's like buying a diary and never writing in it. The table exists but stays empty.

**What we'd build:**
- A small helper function the app can call: "record this event in the diary."
- Add calls to it at the important moments: logins, failed logins, signups, password
  resets, downloads, role changes.
- Optionally an admin screen to read the diary.

---

## 7. No-Enumeration Forgot-Password

**What it is in plain words:**
When someone clicks "Forgot password" and types an email that doesn't exist, the app
currently says **"User not found."** That tells strangers which emails are registered on your
site — information you don't want to give away.

**Why it matters:**
This is a small privacy/security leak. Attackers use it to build lists of real accounts to
target with phishing or password-guessing. The fix is simple: **always say the same thing**,
whether the email exists or not.

**Real-world analogy:**
Imagine a building's front desk. If someone asks "is John here?" and the guard says "no such
person," the visitor learns John doesn't work there. A smart guard says the same neutral
thing for everyone: "If that person works here, they'll be notified." No information leaked.

**In this repo right now:**
The forgot-password flow returns a different message when the email isn't found — leaking
that information.

**What we'd build:**
- Change it so the app always replies something like "If an account exists for that email,
  a reset link has been sent."
- It only actually sends the email when the account exists; otherwise it silently does
  nothing (or sends a generic notice), and the response looks identical either way.

---

## 8. Per-User Escalating Lockout (smarter anti-hacking protection)

**What it is in plain words:**
A way to **stop people from trying thousands of passwords** on your site. It does two things
the current app doesn't:

1. **Tracks by account, not just by internet address.** Currently a hacker can get around
   the limit by switching IP addresses. Per-user tracking catches the account no matter
   where the attack comes from.
2. **Gets stricter each time.** First offense: locked for 15 minutes. Second: 1 hour.
   Third: 24 hours. So repeat attackers are locked out longer and longer.

**Real-world analogy:**
A door with a keypad that's smart about bad guesses. Try too many wrong PINs → the door
locks for 15 minutes. Keep trying → it locks for an hour, then a whole day. And it locks the
*specific door* (account), so going around to another entrance doesn't help.

**In this repo right now:**
There's a basic speed-limit (you can only try a login 10 times a minute), but it resets
every minute and doesn't escalate. A hacker can pace their attempts to slip under it.

**What we'd build:**
- A counter of failed attempts per account and per address.
- Lockout tiers: 15 minutes, then 1 hour, then 24 hours.
- Tell the user how long they're locked out, instead of just a generic error.
- A separate per-user speed limit on search and download actions so one account can't
  hammer the site.

---

## 9. Lead Model: Businesses vs. People (a decision, not a bug)

**What it is in plain words:**
The old WordPress product sold **business** leads — company details like *business name,
owner's name, phone number, revenue, number of employees*.

The current app stores **people** leads — personal profiles like *full name, job title,
LinkedIn URL, industry*.

These are **two different kinds of data**. It's not that something is broken — it's that the
two products were built around different types of information, so they don't share the same
shape.

**Why it matters:**
You need to **decide which one your product is really selling**, because everything else
(downloads, categories, filters) is built on top of that choice. Your live website sells
"B2B business leads," which suggests you may want the business model — but the current app
was built for the people model.

**Real-world analogy:**
Two shops: one sells cars, the other sells houses. You can't just swap inventory. Cars have
engines and mileage; houses have bedrooms and square footage. Before you stock the shelves,
you have to decide: is this a car shop or a house shop?

**In this repo right now:**
The app's database is set up for people (name, headline, LinkedIn, job title). There's no
phone number, no revenue, no number of employees.

**What we'd build (depending on the choice):**
- **Option A — keep people:** nothing changes; the other 8 fixes still work as described.
- **Option B — switch to businesses:** add fields like business name, owner name, phone,
  revenue, employees; add a category system; and update the screens where leads are shown
  and entered.

**Recommendation:** Decide this **first**, before building the quota and dedup systems, so
you don't have to redo them after switching data models.

---

## Quick summary

| # | Feature | Plain-English one-liner |
|---|---|---|
| 1 | Quota & Billing | Membership plans — free users get a daily allowance, paying users get more. |
| 2 | Server-side export | Downloads must go through the server so you can control and charge for them. |
| 3 | Dedup engine | Stop the same lead appearing twice. |
| 4 | External ingest API | Let other programs safely feed leads in automatically. |
| 5 | Google OAuth | The "Sign in with Google" button. |
| 6 | Audit log | A diary of what happened, who, and when. |
| 7 | No-enumeration forgot-password | Don't reveal which emails are registered. |
| 8 | Escalating lockout | Lock attackers out longer each time they guess wrong. |
| 9 | Business vs. people leads | Decide what kind of data the product actually sells. |

**What I'd do first:** decide **#9** (what data you sell), then build **#1 + #2** (the
money-making core), then the cheap high-value wins **#3** (dedup) and **#6** (audit log),
then the security fixes **#7 + #8**, then **#4 + #5** for expansion.
