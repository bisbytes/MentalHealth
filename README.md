# Three Circles

A small, private web app for noticing which emotional zone you're in, any time of day:

- **Red**: threat. Anxious, angry, on alert.
- **Drive** (blue): wanting, striving, pushing on.
- **Green**: calm, safe, settled.

Tap a circle, add a note if you like, and save. The app shows your last 7 days and a full history so you can see patterns over time, or bring them to a therapist.

Each note in History has a copy button, so you can share it, and an edit button to tidy it up (or add a note to a check-in that has none).

> Three Circles is a personal journal, not a replacement for professional care.
> If you're in crisis in the US, call or text **988**. Elsewhere, see [findahelpline.com](https://findahelpline.com).

## Share with your therapist

**Share with your therapist** makes a readable summary for the last 7 days, 2 weeks, 30 days or 3 months: what each circle means, how many check-ins and how much time went to each, any time-of-day patterns, and a day-by-day log. Leave out your notes if you'd rather. Share it from your phone's share sheet, copy it as text, or print it or save it as a PDF. **Your data** is a different thing: a backup for the app to read back, not meant for people.

## Privacy

- No account, no server, no analytics.
- Check-ins are stored in your browser's `localStorage` on the device you use. Clearing site data deletes them.
- **Your data** lets you copy a backup (JSON), restore it on another device, or delete everything.
- Every two weeks the app gently reminds you to back up, since clearing browser data would erase your check-ins.

## Reminders

Three Circles can send a gentle "which circle are you in?" notification on a schedule you choose (every 30 minutes to every 4 hours, between a start and end time). Set it in **Check-in reminders** inside the app.

The app has no server of its own, so reminders come from a tiny [Cloudflare Worker](push-server/) on the free plan. It stores only your device's push address, the schedule and your time zone. Check-ins and notes never leave your device.

Tapping a reminder opens the app ready to check in. On phones that show three notification buttons (most Android phones), you can tap Red, Drive or Green right on the notification.

When recent check-ins lean red (3 of your last 5, or more than half in the last 48 hours), reminders come twice as often for 24 hours, and two green check-ins in a row end that early. This is worked out on your device; the server only receives the faster interval and when it ends. You can switch it off in the app.

On iPhone, notifications only work after you add the app to your home screen (iOS 16.4 or later) and open it from there.

### Set up the reminder server (one time)

You need Node.js 18+, [pnpm](https://pnpm.io/installation) and a free Cloudflare account.

```sh
cd push-server
pnpm install
pnpm exec wrangler login
pnpm run setup
```

`pnpm run setup` creates the storage, makes notification keys, deploys the worker, and writes the server address into `threecircles/config.js`. Commit and push `threecircles/config.js` and `push-server/wrangler.toml` afterwards. If you host the app somewhere other than `https://mentalhealth.bisbytes.com`, change `ALLOWED_ORIGINS` in `push-server/wrangler.toml` first.

### Automatic deploys

After the first setup, GitHub deploys the reminder server whenever `push-server/` changes on `main` (see `.github/workflows/deploy-push-server.yml`). It needs two repository secrets, under **Settings > Secrets and variables > Actions**:

- `CLOUDFLARE_ACCOUNT_ID`: shown on the right of your Cloudflare dashboard's Workers & Pages overview.
- `CLOUDFLARE_API_TOKEN`: create one under **My Profile > API Tokens > Create Token**, using the **Edit Cloudflare Workers** template.

You can also run it by hand from the **Actions** tab. Run `pnpm test` in `push-server` to check the encryption and scheduling.

## Run it

The app lives in `threecircles/` (`index.html`, a service worker for offline use and notifications, the manifest and icons) with no build step. Serve the repo:

```sh
python3 -m http.server 8000
```

Then visit http://localhost:8000/threecircles/.

### Put it on your phone

It's hosted with GitHub Pages at https://mentalhealth.bisbytes.com/threecircles/. Open that on your phone and choose **Add to Home Screen** (Share menu on iPhone, ⋮ menu on Android). It gets its own three-circles icon and works offline.

## Data format

```json
{
  "app": "three-circles",
  "version": 1,
  "entries": [
    { "id": "lx2k9a3f", "zone": "green", "at": "2026-10-16T19:05:00.000Z", "note": "Dinner with my sister." }
  ]
}
```

`zone` is one of `red`, `drive`, `green`. `at` is an ISO 8601 timestamp.

## Credit

The three circles come from the three emotion regulation systems (threat, drive and soothing) in Compassion Focused Therapy, developed by Professor Paul Gilbert. To learn more, see his book *The Compassionate Mind* or the [Compassionate Mind Foundation](https://www.compassionatemind.co.uk/). This project isn't affiliated with or endorsed by either; the app's wording is its own.

Three Circles was designed by [BisBytes](https://bisbytes.com) and built with the help of generative AI. The app itself doesn't use AI: your check-ins and notes stay on your device and are never sent to us or to any AI service. If you turn on reminders, the reminder server keeps only your phone's notification address and your schedule.

## Contributing

Issues and pull requests are welcome. Please keep the tone of any copy gentle and non-judgmental.

## License

[MIT](LICENSE)
