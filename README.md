# Braise

Braise is a conversational AI web app built with React, TanStack Start, and Supabase.

## AI provider configuration

The chat server uses the **OpenAI API directly**. Configure these environment variables in Vercel (Project → Settings → Environment Variables) and in a local `.env` file when developing:

- `OPENAI_API_KEY`: secret API key from your OpenAI Platform account. Keep it server-side; never prefix it with `VITE_`, commit it to Git, or share it in chat.
- `OPENAI_MODEL`: the exact model ID enabled for your OpenAI API project. There is intentionally no hard-coded fallback; choose a model available to your account.

The chat route also relies on the existing Supabase configuration:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Keep any existing Supabase authentication and database environment variables that the rest of the application uses. Do not remove them as part of the AI-provider migration.

After changing Vercel environment variables, redeploy the project for the new values to take effect. OpenAI API usage is billed separately from ChatGPT subscriptions and may incur charges.

## Development

You need Node.js and npm.

```sh
npm install
npm run dev
```

## Deployment

The GitHub repository is connected to Vercel. Changes merged into the configured production branch can trigger a deployment. Test changes on a preview deployment before promoting them to production.
