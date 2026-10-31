# Udaan

**Give your career a new direction.**

Udaan is a voice-first AI career guide for students and early-career professionals. Tell it about yourself, choose a target role, and turn your next move into a practical learning plan.

[Try the live portal](https://udaan-orpin.vercel.app/) · [Watch the demo](https://youtu.be/Tu0UiCLBAsw) · [Contribute](CONTRIBUTING.md) · [Report a bug](https://github.com/vinpuj/udaan/issues)

Built in under 12 hours for the AI Hackathon by Product Space in collaboration with Wispr Flow. Prompts, specifications and fixes were dictated into Codex using Wispr Flow.

## What it does

- Creates a four-week learning plan, skill-gap map and portfolio project suggestions.
- Accepts spoken input through Wispr Flow, or ordinary typed text.
- Imports PDF, TXT and Markdown resumes, with editable extracted text.
- Uses job requirements you provide to make skill suggestions more specific.
- Offers mock interview questions and rubric-based feedback.
- Adjusts the plan after progress or availability updates while preserving completed work.
- Tracks applications and summarizes which kinds of roles receive responses.

Only **Target role** is required. Personal background, resume, employer, source URL and job requirements are optional. The home screen stays simple, with an animated paper-plane logo and a **Watch demo** button.

## Quick start

Use **Node.js 24** and npm. Clone the repository:

```sh
git clone https://github.com/vinpuj/udaan.git
cd udaan
npm ci
```

Copy `.env.example` to `.env`:

```sh
cp .env.example .env
```

In Windows PowerShell, use `Copy-Item .env.example .env` instead.

Set your own `GEMINI_API_KEY` in `.env`, then start the app:

```sh
npm start
```

Open **http://127.0.0.1:4317**. The start command first copies the required PDF.js assets into `public/vendor/`. Restart the server after changing environment variables.

The interface can be explored without a key; live coaching needs a working Gemini key. Forks and clones do not include the original portal's key.

## How to use it

1. Speak or type into **Tell me about yourself**, if you want to provide background.
2. Enter your **Target role**.
3. Optionally add a resume or paste real job requirements.
4. Select **Find my direction**.
5. Use **Practice** for interview feedback and **Applications** to record outcomes.
6. Return to **Plan → View saved plan** to complete tasks or describe what changed.

Refresh returns to the start screen; draft input and saved progress remain in your browser.

Wispr Flow is a separate app that inserts dictated text into the focused field. Udaan receives that text and does not record microphone audio. Typing works without Wispr Flow.

## Development checks

```sh
npm run build
npm test
```

The tests use synthetic data and mocked provider calls. They cover plan budgets, completion preservation, application updates, profile migration, provider output, server-side credential handling, request limits and PDF extraction. They do not require an API key.

## Project map

| Path | Responsibility |
| --- | --- |
| `public/app.mjs` | Interface, intake, dialogs and coaching actions |
| `public/core.mjs` | Plan updates, budgets and application tracking |
| `public/profile.mjs` | Personal profile initialization and migration |
| `public/resume.mjs` | Local PDF and text resume extraction |
| `public/direction.css` | Home screen, animation and demo player styling |
| `api-handler.mjs` | Shared API routes, server credentials and request limits |
| `providers.mjs` | Structured AI requests and response validation |
| `schemas.mjs` | Coaching instructions and output schemas |
| `server.mjs` | Local Node HTTP server |
| `api/index.js` | Vercel function entry point |
| `scripts/build.mjs` | Copies PDF.js assets for local and hosted use |
| `tests/` | Node test-runner checks |

The app uses plain JavaScript modules, HTML and CSS. There is no frontend framework or database. Google Gemini powers the current hosted experience; the provider module also retains an OpenAI adapter for development.

## Deploy your own copy

Import your fork into Vercel. Keep the repository root as the project root; `vercel.json` already defines the build command, output directory and API routes.

Before deploying, add `GEMINI_API_KEY` as a **Production Secret/Sensitive environment variable** in the Vercel project. `GEMINI_MODEL` is optional; its default is recorded in `.env.example`. Add a separate secret for Preview if you want preview deployments to run coaching.

Redeploy after changing environment variables. Visitors connect through the backend automatically and never enter or receive the server key. Usage belongs to the Gemini project whose key you configure.

To replace the demo video, update its embed and fallback URLs in `demoDialog()` in `public/app.mjs`. The YouTube player is loaded only after **Watch demo** is clicked and removed when the popup closes.

## Data and current limits

- Profiles, drafts and progress are stored in browser localStorage. There are no cloud accounts or cross-device synchronization.
- PDF files are parsed in the browser. Extracted text and relevant input are sent to Gemini when coaching is requested.
- PDF import supports selectable-text documents up to **10 MB and 20 pages**. Scanned or password-protected PDFs need an unlocked text-based copy or pasted text; OCR is not implemented.
- Job descriptions must be supplied by the user. The app does not browse job boards or verify current openings.
- The application tracker records updates; it does not apply to jobs or contact employers.
- Interview feedback evaluates answer content, not accent or voice delivery. Plans and feedback are guidance, not guarantees of employment.
- Basic request limits are **10 calls per IP per minute, 60 total calls per minute and 8 concurrent calls per function instance**. They reset on restart and do not provide a global spending cap across serverless instances.

See [SECURITY.md](SECURITY.md) for credential handling and private vulnerability reporting.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), browse [open issues](https://github.com/vinpuj/udaan/issues), or propose a focused improvement. Bug report, feature request and pull request templates are included.

Good starting areas include accessibility, mobile usability, resume extraction, plan-update regression cases, clearer feedback and additional languages.

## License and acknowledgements

Udaan's source code is available under the [MIT license](LICENSE). Dependencies and external services retain their own licenses and terms.

PDF extraction uses [Mozilla PDF.js](https://github.com/mozilla/pdf.js), whose license is copied alongside the generated browser assets. Wispr Flow, Google Gemini and YouTube are external services and are not included in this repository.
