## Migration/Import Instructions

To import data into the application, you can use the following endpoints:

### Import CSV (admin):

```bash
curl -X POST http://localhost:4000/api/admin/import/places/csv -H "Authorization: Bearer <token>" -F "file=@/path/to/places.csv"
```

### Import GeoJSON (admin):

```bash
curl -X POST http://localhost:4000/api/admin/import/places/geojson -H "Authorization: Bearer <token>" -F "file=@/path/to/places.geojson"
```

### Export SQLite tables to CSV and import into Postgres

1) Export CSV from your local SQLite (script provided):

```bash
# create csv files from data/mapdang.sqlite
npm run export:sqlite:csv
```

CSV files will be written to `tmp/sqlite-csv/`.

2) Import CSV into Postgres (psql):

```bash
# example for places
psql $DATABASE_URL -c "\copy place(id,name,description,latitude,longitude,categoryId) FROM 'tmp/sqlite-csv/place.csv' CSV HEADER"
```

Repeat for other tables (category, room, course, instructor, schedule, device, session, position, edge, user).

3) Run migrations (if you use TypeORM migrations):

```bash
# ensure DATABASE_URL is set
npm run typeorm:run
```

After import, start the app with `DATABASE_URL` set; the admin export endpoints will now use Postgres and you can regenerate offline SQLite packs from Postgres data.


# MapDang - Backend (Express + TypeScript)

Backend scaffold for the MapDang project (University of Ngaoundéré campus map).

Quick start

1. Copy environment example:

   cp .env.example .env

2. Install dependencies:

```bash
cd campus-map-backend
npm install
```

3. Run in development:

```bash
npm run dev
```

4. Build and start:

```bash
npm run build
npm start
```

This scaffold includes example entities (Place, Category, Room, Course, User), basic CRUD routes, and an admin route.

Detailed steps

1) Install dependencies

```bash
cd campus-map-backend
npm install
```

Single-command install (Debian/Ubuntu) — installs system build tools and npm deps:

```bash
sudo apt update && sudo apt install -y build-essential python3 make && cd campus-map-backend && npm install
```

2) Configure `.env` with `DATABASE_URL` (Postgres) and `ADMIN_TOKEN`.

Example `.env` variables (see `.env.example`):

- PORT
- NODE_ENV
- DATABASE_URL (postgres://user:pass@host:5432/dbname)
- JWT_SECRET (used for user auth tokens)
- SHARE_SECRET (used to sign share links)
- ADMIN_EMAIL, ADMIN_PASSWORD (used by seed to create admin)

If you don't provide `DATABASE_URL` the server will run but persistence will be disabled.

Mapbox directions support

To use Mapbox routing you must set `MAPBOX_TOKEN` in `.env`. Example request:

```bash
curl "http://localhost:4000/api/route/mapbox?fromLon=13.58&fromLat=7.33&toLon=13.59&toLat=7.34"
```

3) Seed sample data (after DB is reachable):

```bash
npm run seed
```

4) Run dev server:

```bash
npm run dev
```

API examples

- Health:

   curl http://localhost:4000/health

- Create place (admin):

   curl -X POST http://localhost:4000/api/admin/places -H "Content-Type: application/json" -H "x-admin-token: change_me_secret_admin_token" -d '{"name":"Amphi B","latitude":7.33,"longitude":13.58,"category":"Amphi"}'

- Search places:

   curl "http://localhost:4000/api/search/places?q=Amphi"

   Auth (JWT)

   Register:

   ```bash
   curl -X POST http://localhost:4000/api/auth/register -H "Content-Type: application/json" -d '{"email":"user@example.com","password":"secret"}'
   ```

   Login:

   ```bash
   curl -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@mapdang.local","password":"admin123"}'
   ```

   Use returned token as:

      -H "Authorization: Bearer <token>"

   Admin CRUD examples (use admin account created by seed):

   - Create category:

      curl -X POST http://localhost:4000/api/admin/categories -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"name":"Laboratoire"}'

   - Update place:

      curl -X PUT http://localhost:4000/api/admin/places/<placeId> -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"description":"Nouvelle description"}'

      Import CSV (admin):

      ```bash
      curl -X POST http://localhost:4000/api/admin/import/places/csv -H "Authorization: Bearer <token>" -F "file=@/path/to/places.csv"
      ```

      Import GeoJSON (admin):

      ```bash
      curl -X POST http://localhost:4000/api/admin/import/places/geojson -H "Authorization: Bearer <token>" -F "file=@/path/to/places.geojson"
      ```

      Create a share link for a place (admin or any authenticated user):

      ```bash
      curl -X POST http://localhost:4000/api/admin/share -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"placeId":"<id>","ttl":3600}'
      ```

      View shared link (public):

      ```bash
      curl http://localhost:4000/share/<token>
      ```

      Export offline pack (admin):

      ```bash
      curl -H "Authorization: Bearer <token>" http://localhost:4000/api/admin/export/offline
      ```

      Export SQLite offline DB (admin):

      ```bash
      curl -H "Authorization: Bearer <token>" http://localhost:4000/api/admin/export/sqlite --output mapdang.sqlite

   Import edges CSV (admin) - create routable graph for offline:

   curl -X POST http://localhost:4000/api/admin/import/edges/csv -H "Authorization: Bearer <token>" -F "file=@/path/to/edges.csv"

   edges.csv expected columns: fromId,toId,cost,meta (meta optional JSON)

   After importing edges you can regenerate the sqlite pack and the `node` and `edge` tables will be included for mobile offline routing.
      ```

      Device/session endpoints:

      - Register device:

         curl -X POST http://localhost:4000/api/devices/register -H "Content-Type: application/json" -d '{"deviceId":"device-123","name":"Phone"}'

      - Start session:

         curl -X POST http://localhost:4000/api/devices/session -H "Content-Type: application/json" -d '{"deviceId":"device-123","metadata":"app v1"}'

      - End session:

         curl -X POST http://localhost:4000/api/devices/session/<sessionId>/end




Notes
- This scaffold is a starting point. Replace the simple admin token with a proper auth solution before production.
- Use migrations (TypeORM CLI) and set `synchronize: false` in production.
- Before production make sure to set strong secrets in environment variables and enable TLS.

Real-time location integration
-----------------------------

The backend supports a simple real-time location flow using:

- POST /api/devices/location — authenticated JSON endpoint to send { deviceId, latitude, longitude, accuracy, heading }
- GET /api/devices/stream/:deviceId — authenticated Server-Sent Events endpoint to receive live updates

Client sample: use the snippet below in your frontend (no `docs/` file shipped). Replace BACKEND_URL, DEVICE_ID and AUTH_TOKEN with your values.

JavaScript (browser) snippet:

```js
// configure
const BACKEND_URL = 'http://localhost:4000';
const DEVICE_ID = 'device-demo-1';
const AUTH_TOKEN = 'Bearer <JWT_TOKEN_FROM_LOGIN>';

// SSE receiver
const evtSource = new EventSource(`${BACKEND_URL}/api/devices/stream/${DEVICE_ID}`);
evtSource.onmessage = (e) => {
   const data = JSON.parse(e.data);
   console.log('location update', data);
   // update your map marker here
};

// POST location helper
function postLocation(lat, lon, accuracy) {
   fetch(`${BACKEND_URL}/api/devices/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': AUTH_TOKEN },
      body: JSON.stringify({ deviceId: DEVICE_ID, latitude: lat, longitude: lon, accuracy }),
   });
}

// use browser geolocation
if (navigator.geolocation) {
   navigator.geolocation.watchPosition((pos) => {
      postLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
   }, console.error, { enableHighAccuracy: true });
}
```

Schedules & offline routing
---------------------------

- List schedules:

   curl http://localhost:4000/api/schedules

- Create a schedule (admin):

   curl -X POST http://localhost:4000/api/schedules -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"courseId":"<id>","startAt":"2025-11-21T08:00:00Z","endAt":"2025-11-21T10:00:00Z"}'

- Offline routing (server-side, uses imported edges):

   curl "http://localhost:4000/api/route/offline?fromId=<nodeId>&toId=<nodeId>"

   Response: { path: ["nodeA","nodeB","nodeC"], distance: 12.34 }


   Postgres / pgAdmin4 - connection & migration
   -------------------------------------------

   1) Configure your Postgres server in pgAdmin4 and create a database (e.g. `mapdang`) and a user.

   2) Copy `.env.example` to `.env` and set `DATABASE_URL` accordingly:

      DATABASE_URL=postgres://<user>:<password>@<host>:5432/<database>

   3) Apply migrations with TypeORM (recommended):

      npm run typeorm:migrate

      Or run the SQL directly via psql (requires `psql` in PATH):

      psql "$DATABASE_URL" -f migrations/0001_init.sql

   4) (Optional) Import CSV data exported from SQLite:

      npm run export:sqlite:csv
      psql "$DATABASE_URL" -f scripts/import-csv-to-postgres.sql

   5) Start the server and confirm it logs "Database connected (postgres)".





