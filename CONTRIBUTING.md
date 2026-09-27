# Contributing

Thanks for helping out.

## Bug reports

Open an issue. Include the steps to reproduce it, what you expected, and what happened instead. Your Obsidian version and platform help too.

## Pull requests

1. Fork the repo and create a branch.
2. Make your change.
3. Run `npm run build` and `npm run lint`. Fix warnings as well as errors.
4. Try it in a real vault.
5. Open a PR that explains what changed and why.

If your change affects how the plugin behaves, update [USER-GUIDE.md](USER-GUIDE.md) and the key table in [README.md](README.md). If it adds or renames a CSS class, update [THEME.md](THEME.md).

## Development

```bash
npm install
npm run dev     # rebuild on change
npm run build   # type-check and production build
npm run lint    # eslint with eslint-plugin-obsidianmd
```

To test, copy `main.js`, `manifest.json`, and `styles.css` into `<your vault>/.obsidian/plugins/dired/` and reload the plugin.
