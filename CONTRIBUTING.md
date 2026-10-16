# Contributing

## Run it

Open `index.html` in any modern browser. There is no build step and no network access.

## Test it

```bash
npm test              # node --test test/
npm run benchmark     # regenerates the results table in the README
```

## The one rule that matters

**`index.html` must stay a single self-contained file.** No bundler, no CDN, no `<script src>`, no `fetch`.
It has to keep working when someone double-clicks it out of their Downloads folder.

The simulation core is delimited by the comments `// ==CORE-START==` and `// ==CORE-END==`.
Everything in that block must stay free of DOM access, because the tests and the benchmark slice
exactly that text out of the HTML and run it under Node. That is what guarantees the numbers in the
README come from the shipping code rather than a reimplementation of it.

## Before you open a pull request

- `npm test` passes. Collisions and red-light runs must stay at **0** in every scenario.
- Any timing constant you add is named and documented, not a bare number.
- If you change behaviour, update the benchmark table in `README.md` with numbers you actually ran.
- Respect `prefers-reduced-motion` and keep text at a contrast ratio of 4.5:1 or better.
