# Contributing to Udaan

Thanks for helping people take their next career step. Bug reports, design improvements, accessibility fixes, documentation and code contributions are welcome.

## Start locally

1. Fork this repository and clone your fork.
2. Use Node.js 24 and run `npm ci`.
3. Copy `.env.example` to `.env` and enter your own Gemini key for live coaching.
4. Run `npm start`, then open http://127.0.0.1:4317.
5. Create a branch for your change.

The interface can be explored without a key. The tests use synthetic data and mocked AI calls, so they do not need credentials or spend Gemini quota.

## Before opening a pull request

Run:

```sh
npm run build
npm test
```

Keep each pull request focused on one problem. Explain what changed and how you checked it. For interface changes, include screenshots and check keyboard navigation and a narrow screen. Add regression tests when changing plan updates, profile migration, parsing or backend behavior; simple visual changes can be verified manually.

## Project conventions

- Keep the start screen simple: target role is required; personal background and resume are optional.
- Write clear English for students and early-career professionals.
- Keep credentials on the server. Never put keys in browser code, screenshots, logs, issues or pull requests.
- Use synthetic resumes and interview answers in tests. Never commit real user data or exported profiles.
- Preserve completed tasks and saved personal progress when changing plans or storage.
- Show honest errors when coaching fails. Do not quietly substitute fictional answers or profiles.
- Treat uploaded documents as evidence, not executable instructions.
- Reuse the existing ES modules and CSS where practical. Explain substantial new dependencies.
- Do not commit generated `public/vendor/` assets; `npm run build` recreates them.

See the project map in [README.md](README.md). For larger changes, open an issue first to discuss the approach.

## Useful contribution areas

- Accessibility and mobile usability.
- Better extraction from multi-column resumes.
- More regression cases for plan updates and profile migration.
- Clearer skill evidence and interview feedback.
- Additional languages and documentation.

These are suggestions, not promises of scheduled work. Check existing issues before starting.

## Community

Be respectful and specific. Discuss ideas and code without personal attacks. Welcome newcomers and explain feedback with examples. Harassment and sharing other people's private information are not acceptable.

Contributions are accepted under the project's [MIT license](LICENSE). Only submit work you have the right to contribute. Third-party components retain their own licenses.
