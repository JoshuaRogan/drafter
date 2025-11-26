## Celebrity Draft Pool – Netlify + React

This is a small React app for running a **celebrity draft pool** with up to **12 users** watching the same draft board in real time.

- **One user is the “Draft Leader”** and controls configuration, undo, and reset.
- **Other users are “Drafters”** who make picks when it’s their turn.
- All users load the same Netlify URL and the board stays in sync using WebSockets via Ably.

### Tech stack

- **React + TypeScript + Vite** for the frontend.
- **Ably** as the real-time transport (WebSocket-based channels).
- **Netlify** for static hosting (`netlify.toml` is included).

### Running locally

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file in the project root with your Ably key:

```bash
VITE_ABLY_API_KEY=your-ably-api-key-here
```

3. Start the dev server:

```bash
npm run dev
```

4. Open the printed `localhost` URL in multiple browser windows/tabs to simulate multiple users.

### Deploying to Netlify

1. Push this repo to GitHub (or your Git provider).
2. In Netlify:
   - Set **Build command** to `npm run build`.
   - Set **Publish directory** to `dist`.
   - Add an environment variable `VITE_ABLY_API_KEY` with your Ably API key.
3. Trigger a deploy.
4. Share the deployed URL with your drafters.

### How the draft flow works

- Everyone opens the same URL.
- Each user:
  - Enters a **display name**.
  - Chooses a **role**: `Draft leader` or `Drafter`.
- The **leader**:
  - Sets number of rounds.
  - Optionally pastes a custom celebrity list (one per line) or uses the built-in list.
  - Starts the draft.
- The **board**:
  - Tracks rounds, pick order, and which drafter owns each celebrity.
  - Is broadcast over an Ably channel so every connected browser sees the same state.

> Note: For simplicity, the leader’s browser is treated as the authority that validates picks and pushes updated state to everyone via Ably. In normal friendly pool usage, this gives you a simple, centralized control point without needing a custom backend.


