# Three Circles

A small, private web app for noticing which emotional zone you're in, any time of day:

- **Red**: threat. Anxious, angry, on alert.
- **Drive** (blue): wanting, striving, pushing on.
- **Green**: calm, safe, settled.

Tap a circle, add a note if you like, and save. The app shows your last 7 days and a full history so you can see patterns over time, or bring them to a therapist.

> Three Circles is a personal journal, not a replacement for professional care.
> If you're in crisis in the US, call or text **988**. Elsewhere, see [findahelpline.com](https://findahelpline.com).

## Privacy

- No account, no server, no analytics.
- Check-ins are stored in your browser's `localStorage` on the device you use. Clearing site data deletes them.
- **Your data** lets you copy a backup (JSON), restore it on another device, or delete everything.

## Run it

It's a single static file with no build step. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

### Put it on your phone

Host the folder anywhere that serves static files (GitHub Pages, Netlify, Cloudflare Pages), open the URL on your phone, and use "Add to Home Screen".

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

## Contributing

Issues and pull requests are welcome. Please keep the tone of any copy gentle and non-judgmental.

## License

[MIT](LICENSE)
