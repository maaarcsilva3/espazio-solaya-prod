# Booking Admin Dashboard

Admin dashboard for managing offerings/amenities, booking requests and a booking calendar.

- **client/** - React + Vite + TypeScript + Tailwind + Flowbite React + FullCalendar (free/MIT plugins)
- **server/** - Express + TypeScript API (PostgreSQL via `pg`), also serves the built client
- **Dockerfile** - multi-stage production image (build once, run compiled artifacts)

## Deploy with Docker Compose

One Compose file in the parent folder starts Postgres and this dashboard (immutable image).
TLS is handled by **your existing host nginx** (or another reverse proxy). The app listens on `127.0.0.1:3000` only.

```bash
cd ..
cp .env.example .env
cp admin-dashboard/.env.example admin-dashboard/.env
# Set strong POSTGRES_PASSWORD, JWT_SECRET (≥32 chars), ADMIN_PASSWORD
# Keep COOKIE_SECURE=true; set CORS_ORIGIN to your real website origins (no *)
mkdir -p ../database/data              # Postgres files on the host
docker compose up -d --build
```

Point nginx at the loopback port under a path prefix (same pattern as your other `/dev/...` apps).
Paste-ready block: [`../deploy/nginx-booking-admin.conf.example`](../deploy/nginx-booking-admin.conf.example).

Default mount: `https://your-domain/dev/espazio-admin/` (`BASE_PATH` in `.env`). Rebuild after changing it.

Then open that URL and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

The first admin is only created when the `admins` table is empty. Change the password
from **Admins > Change my password** after the first login.

Never commit `.env` files. Rotate secrets if they were ever shared or checked in.

To deploy code changes: rebuild the image (`docker compose up -d --build dashboard`).

## Environment variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | `postgres://user:password@host:5432/db` (Compose overrides this for the container) |
| `DATABASE_SSL` | `true` if the database requires SSL |
| `DATABASE_SSL_INSECURE` | `true` only if the DB cert cannot be verified (avoid in production) |
| `JWT_SECRET` | Long random string (≥32 chars) for signing login sessions |
| `COOKIE_SECURE` | `true` when served over HTTPS (required for production) |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin account |
| `CORS_ORIGIN` | Comma-separated website origins for the public API (do not use `*` in production) |
| `BASE_PATH` | nginx mount path without trailing slash (e.g. `/dev/espazio-admin`); bake into the image via Compose build arg |

## Local development

```bash
npm install
cp .env.example .env     # DATABASE_URL → localhost:5437; COOKIE_SECURE=false for HTTP Vite
npm run dev:server       # API on http://localhost:3000
npm run dev:client       # UI on http://localhost:5173 (proxies /api to :3000)
npm test                 # unit + API smoke tests
npm run build            # production client + server build
```

## Website form integration

The public API is available without login and is limited to the origins in `CORS_ORIGIN`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/public/offerings` | Active offerings for the form (`type` is `event_place_with_rooms`, `event_place_only`, `room_only` or `amenity`) |
| `POST` | `/api/public/requests` | Submit a booking request (saved with status `pending`) |

Request body for `POST /api/public/requests`:

| Field | Required | Notes |
| --- | --- | --- |
| `full_name` | yes | |
| `email` | yes | |
| `phone` | no | |
| `offering_id` | no | id of a non-amenity offering |
| `start_date` / `end_date` | yes | `YYYY-MM-DD`, start cannot be in the past |
| `guests` | no | whole number |
| `event_type` | no | e.g. Wedding, Birthday |
| `message` | no | |
| `amenity_ids` | no | array of amenity offering ids |
| `website` | no | **honeypot** - keep as a hidden empty input; bots that fill it are ignored |

Submissions are rate-limited to 10 per hour per IP. Validation errors return `400` with
`{ message, errors: { field: [messages] } }`.

### Example

```html
<form id="booking-form">
  <input name="full_name" required />
  <input name="email" type="email" required />
  <input name="phone" />
  <select name="offering_id" id="offering"></select>
  <input name="start_date" type="date" required />
  <input name="end_date" type="date" required />
  <input name="guests" type="number" min="1" />
  <input name="event_type" />
  <div id="amenities"></div>
  <textarea name="message"></textarea>
  <input name="website" style="display:none" tabindex="-1" autocomplete="off" />
  <button type="submit">Send request</button>
</form>

<script>
  const API = 'https://admin.your-domain.com';

  fetch(`${API}/api/public/offerings`)
    .then((r) => r.json())
    .then((offerings) => {
      const select = document.getElementById('offering');
      const amenities = document.getElementById('amenities');
      select.innerHTML = '<option value="">Select...</option>';
      offerings.forEach((o) => {
        if (o.type === 'amenity') {
          amenities.insertAdjacentHTML(
            'beforeend',
            `<label><input type="checkbox" name="amenity_ids" value="${o.id}"> ${o.name}</label>`,
          );
        } else {
          select.insertAdjacentHTML('beforeend', `<option value="${o.id}">${o.name}</option>`);
        }
      });
    });

  document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const body = Object.fromEntries(form);
    body.amenity_ids = form.getAll('amenity_ids').map(Number);
    body.offering_id = body.offering_id ? Number(body.offering_id) : null;
    body.guests = body.guests ? Number(body.guests) : null;

    const res = await fetch(`${API}/api/public/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      alert('Thank you! We will contact you shortly.');
      e.target.reset();
    } else {
      alert(data.message);
    }
  });
</script>
```
