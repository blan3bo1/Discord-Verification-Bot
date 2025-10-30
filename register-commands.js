const { DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID, GUILD_ID } = process.env;

// Global commands (work in all servers)
const globalCommands = [
  {
    name: 'verify',
    description: 'Start the verification process to get server access'
  }
];

// Guild-specific commands (only in your server)
const guildCommands = [
  {
    name: 'setup',
    description: 'Setup verification system (Admin only)'
  },
  {
    name: 'verify_modal',
    description: 'Open verification modal (for testing)'
  }
];

async function registerCommands() {
  console.log('Starting command registration...');
  
  // Register global commands
  console.log('\nRegistering global commands:');
  for (const command of globalCommands) {
    const response = await fetch(
      `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
      }
    );
    
    if (response.ok) {
      console.log(`✅ Registered global command: ${command.name}`);
    } else {
      const errorText = await response.text();
      console.error(`❌ Error registering ${command.name}:`, errorText);
    }
  }
  
  // Register guild commands
  if (GUILD_ID) {
    console.log('\nRegistering guild commands:');
    for (const command of guildCommands) {
      const response = await fetch(
        `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${GUILD_ID}/commands`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(command),
        }
      );
      
      if (response.ok) {
        console.log(`✅ Registered guild command: ${command.name}`);
      } else {
        const errorText = await response.text();
        console.error(`❌ Error registering ${command.name}:`, errorText);
      }
    }
  }
  
  console.log('\nCommand registration complete!');
}

// Check if required environment variables are set
if (!DISCORD_BOT_TOKEN) {
  console.error('❌ ERROR: DISCORD_BOT_TOKEN environment variable is required');
  process.exit(1);
}

if (!DISCORD_APPLICATION_ID) {
  console.error('❌ ERROR: DISCORD_APPLICATION_ID environment variable is required');
  process.exit(1);
}

registerCommands().catch(console.error);
