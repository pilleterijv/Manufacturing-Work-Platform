# Run in GitHub Codespaces without installing software on your PC

Codespaces runs Node.js and the PostgreSQL container on GitHub's computers. You do not need local Node, Docker Desktop, WSL or Windows administrator access. Your company's GitHub policy must permit Codespaces.

1. Open the repository on GitHub. Select **codex/rebuild-floorwork** in the branch selector. An older branch can show the old green app.
2. Choose **Code → Codespaces → Create codespace**. If using creation options, select that same branch. An existing Codespace needs the updated code and **Codespaces: Rebuild Container** from the command palette to apply the new configuration. Back up existing database/files before changing an existing setup.
3. Wait for the post-create setup to finish in the terminal. It installs dependencies, creates the pilot database, applies migrations and builds the app. First setup takes several minutes. If it fails, correct the reported error and run `npm run codespaces:setup` again.
4. Run `npm run codespaces:admin`. Choose your administrator username and a unique password privately. There is no default app account.
5. Run `npm run codespaces:start`. Leave that terminal running. Open **Ports → 3000 → Open in Browser** and sign in. Keep port visibility **Private**.
6. After updating source, stop the app with Ctrl+C, run `npm run codespaces:setup`, then `npm run codespaces:start`. A refresh alone does not rebuild an older app.

The helper maintains an ignored `.env.codespaces` separately from Windows `.env`, sets the exact HTTPS preview origin and uses the internal pilot database. Do not put company credentials in committed files. The database port is not published. The container's simple development database credentials are unsuitable for production. The helper refuses a changed database target to avoid migrating a different database accidentally.

## Install the shortcut on an iPad or tablet

Open the HTTPS address shown by `codespaces:start` directly on that device. Private Codespaces ports require authorization to the Codespace (normally the creator's GitHub sign-in). Do not make a port public to bypass this. Organisation sharing depends on GitHub policies; a company-hosted app is the appropriate next step for employee access.

- **iPad/iPhone:** Safari → Share → Add to Home Screen → Add. Scroll down in Share if needed. Leave Open as Web App enabled if offered.
- **Android:** Chrome → three-dot menu → Install app or Add to Home screen.
- **Windows:** Edge → menu → Apps → Install this site as an app; Chrome → menu → Cast, save, and share → Install page as app. Names vary by browser version.

Use **Installation help** in the banner or **Install app / Help** after dismissing it to see these instructions again. Browsers control the automatic install prompt. It can disappear after installation, dismissal or because of company policy. A computer's localhost address cannot be used by another device.

## Pilot limits and data

An installed shortcut still needs the running server and an internet connection. Codespaces can stop when idle; alerts and integrations stop with it. It is a development/pilot environment, not an always-on service for 100 employees. Compute and storage are subject to GitHub quotas and billing.

Database data persists in the Codespace's volume and uploads in its workspace across ordinary stops. Deleting a Codespace can destroy both. Back up PostgreSQL and uploads outside the Codespace before deletion or migration. Pushing Git code does not back up either. Company SQL/TrakSYS systems need IT-approved network access; Codespaces cannot automatically reach internal company servers.

Configuration and local browser tests do not prove a live GitHub Codespace or physical iPad has been tested. Validate the HTTPS preview, login, saving work and device installation in your own Codespace before a pilot.

References: [Codespaces ports](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace), [default environment variables](https://docs.github.com/en/codespaces/developing-in-a-codespace/default-environment-variables-for-your-codespace).
