# Candy Wall

It's a wall of candy. A canvas breakout game with 8-bit looks and sound, built with [Vite](https://vite.dev).

**Play:** https://etwilliams.github.io/candy-wall/

## How to play

Break every brick to clear the level. You have three balls (lives); lose one when it falls past the paddle. Each level is a little faster, and more bricks need two hits.

| Input | Action |
|---|---|
| Mouse / touch / ← → | Move the paddle |
| Click / tap / Space | Launch the ball, or pop the paddle up |
| Esc | Pause |
| M | Mute |

**Pop shot:** clicking pops the paddle up. A ball hit while the paddle is up is boosted: faster, and it smashes through the first brick it touches. Launching works the same way.

**Tough bricks** (darker, with a brick pattern) take two hits and show cracks after the first.

## Power-ups

Bricks sometimes drop a capsule. Catch it with the paddle.

| Capsule | Effect |
|---|---|
| Split | Every ball becomes three |
| Big ball | Bigger ball for ~10 s |
| Wide paddle | Wider paddle for ~10 s |
| Fireball | Burns through every brick until it hits the top wall |
| Missiles | Each click fires rockets for ~8 s |
| Slow ball | Slower ball for ~10 s |
| Extra life | One more ball (up to 5) |
| Sticky paddle | Paddle catches the ball; click to release with a boosted shot |
| Shield | A line along the bottom saves one miss |

**Power-downs** (red outline) are rarer: **Narrow paddle** and **Fast ball**.

## Development

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build in dist/
npm run preview  # serve the production build
```

All sound is synthesized with the Web Audio API, so there are no audio files. The pixel font is [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) via `@fontsource`.

- `src/main.js`: game logic, drawing and input
- `src/sound.js`: sound effects and music

## Deployment

Pushes to `main` build and deploy to GitHub Pages through `.github/workflows/deploy.yml`. In the repo's **Settings → Pages**, set the source to **GitHub Actions**.

## License

See [LICENSE](LICENSE).
