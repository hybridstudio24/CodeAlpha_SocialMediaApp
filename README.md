# Kindling — a mini social media app

A small full-stack social app: user profiles, posts, comments, likes, and follows.

- **Backend:** Express.js + SQLite (via `better-sqlite3`), JWT auth, bcrypt password hashing
- **Frontend:** plain HTML/CSS/JavaScript (no framework, no build step)
- **Database:** SQLite file, auto-created on first run at `db/social.db`

## Getting started

```bash
cd mini-social-app
npm install
cp .env.example .env      # then edit JWT_SECRET to a random string
npm start
```

Open **http://localhost:3000**. The database and its tables are created automatically the first time the server runs — no manual migration step needed.

For auto-restart during development:
```bash
npm run dev
```

## Project structure

```
mini-social-app/
├── server.js              # Express app entry point
├── db/
│   └── database.js        # SQLite connection + schema (users, posts, comments, likes, follows)
├── middleware/
│   └── auth.js             # JWT verification middleware
├── routes/
│   ├── auth.js             # register / login / me
│   ├── users.js             # profiles, follow / unfollow, followers / following
│   ├── posts.js             # create/read/delete posts, like / unlike
│   └── comments.js          # delete a comment
└── public/                  # static frontend
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

## Data model

| Table      | Key columns                                                    |
|------------|------------------------------------------------------------------|
| `users`    | id, username, email, password_hash, bio, avatar_url             |
| `posts`    | id, user_id, content, image_url, created_at                     |
| `comments` | id, post_id, user_id, content, created_at                       |
| `likes`    | id, post_id, user_id (unique per post+user)                     |
| `follows`  | id, follower_id, following_id (unique per pair)                 |

## API reference

All authenticated routes expect `Authorization: Bearer <token>`.

**Auth**
- `POST /api/auth/register` — `{ username, email, password }`
- `POST /api/auth/login` — `{ username, password }` (username or email)
- `GET  /api/auth/me`

**Users**
- `GET  /api/users/:username`
- `PUT  /api/users/me/update` — `{ bio, avatar_url }`
- `POST   /api/users/:id/follow`
- `DELETE /api/users/:id/follow`
- `GET  /api/users/:id/followers`
- `GET  /api/users/:id/following`

**Posts**
- `GET    /api/posts` — feed. `?scope=following` for posts from people you follow; `?user_id=` for one user's posts
- `POST   /api/posts` — `{ content, image_url? }`
- `GET    /api/posts/:id`
- `DELETE /api/posts/:id` — author only
- `POST   /api/posts/:id/like`
- `DELETE /api/posts/:id/like`
- `GET    /api/posts/:id/comments`
- `POST   /api/posts/:id/comments` — `{ content }`

**Comments**
- `DELETE /api/comments/:id` — author only

## Notes

- Passwords are hashed with bcrypt; never stored in plain text.
- Auth uses a signed JWT (7-day expiry) stored in the browser's `localStorage`.
- The frontend is a single-page app — `public/js/app.js` handles routing between Feed, Following, and Profile views, plus a modal for comment threads.
- This is a learning/demo-scale project: for production you'd want rate limiting, input sanitization beyond basic checks, pagination on the feed, and image upload handling rather than raw `image_url` strings.
