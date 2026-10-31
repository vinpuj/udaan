# Security

## Reporting a vulnerability

Use **Security → Report a vulnerability** on this GitHub repository for private reports. Include the affected behavior, minimal reproduction steps and potential impact, using synthetic data.

Do not include live API keys, authentication tokens, personal resumes or other users' data. Do not post security exploit details in a public issue.

## Credentials and deployment

- Keep local keys in `.env`, which is ignored by Git.
- For Vercel, configure `GEMINI_API_KEY` as a Production Secret/Sensitive environment variable. Never expose it through a public environment variable or client code.
- Each deployment uses its owner's Gemini project and quota. Forks do not receive the original deployment's key.
- Profiles and progress are stored in each visitor's browser. The prototype has no cloud account or profile database.
- Resume files are parsed locally; the extracted text and relevant coaching input are sent to Gemini when a visitor requests coaching.
- The current request limits are in-memory and per function instance. They are not a global cost cap or a substitute for account-level quota controls on a public deployment.

If a credential is exposed, revoke or rotate it with the provider and update the deployment. Removing it from the latest commit alone does not invalidate it or remove it from Git history.
