#!/bin/bash

echo "🚀 Deploying Discord Verification Bot..."

# Set secrets (you'll need to run these manually first)
# npx wrangler secret put DISCORD_PUBLIC_KEY
# npx wrangler secret put DISCORD_APPLICATION_ID
# npx wrangler secret put DISCORD_BOT_TOKEN
# npx wrangler secret put VERIFIED_ROLE_ID
# npx wrangler secret put GUILD_ID

# Deploy to Cloudflare Workers
npx wrangler deploy

echo "✅ Deployment complete!"
echo "📝 Don't forget to register commands: npm run register-commands"
