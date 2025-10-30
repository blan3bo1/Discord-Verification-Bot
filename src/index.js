import { 
  verifyKey, 
  InteractionType, 
  InteractionResponseType,
  MessageFlags 
} from 'discord-interactions';

export default {
  async fetch(request, env) {
    if (request.method === 'POST') {
      return handleInteraction(request, env);
    }
    return new Response('Discord Verification Bot is running!', { status: 200 });
  }
};

async function handleInteraction(request, env) {
  // Verify the request signature
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  const body = await request.text();
  
  const isValidRequest = verifyKey(
    body,
    signature,
    timestamp,
    env.DISCORD_PUBLIC_KEY
  );
  
  if (!isValidRequest) {
    return new Response('Invalid signature', { status: 401 });
  }
  
  const interaction = JSON.parse(body);
  
  // Handle different interaction types
  switch (interaction.type) {
    case InteractionType.PING:
      return respond({ type: InteractionResponseType.PONG });
      
    case InteractionType.APPLICATION_COMMAND:
      return handleApplicationCommand(interaction, env);
      
    case InteractionType.MODAL_SUBMIT:
      return handleModalSubmit(interaction, env);
      
    default:
      return new Response('Unknown interaction type', { status: 400 });
  }
}

async function handleApplicationCommand(interaction, env) {
  const { name } = interaction.data;
  
  switch (name) {
    case 'verify':
      return handleVerifyCommand(interaction, env);
    case 'setup':
      return handleSetupCommand(interaction, env);
    case 'verify_modal':
      return handleVerifyModalCommand(interaction, env);
    default:
      return respond({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Unknown command',
          flags: MessageFlags.EPHEMERAL
        }
      });
  }
}

async function handleVerifyCommand(interaction, env) {
  const userId = interaction.member.user.id;
  
  // Generate a random verification code
  const verificationCode = generateVerificationCode();
  
  // Store the code in KV with a 10-minute expiration
  await env.VERIFICATION_CODES.put(
    `code:${verificationCode}`, 
    userId, 
    { expirationTtl: 600 } // 10 minutes
  );
  
  // Also store user's current codes for cleanup
  const userCodes = await env.VERIFICATION_CODES.get(`user:${userId}`) || '[]';
  const codesArray = JSON.parse(userCodes);
  codesArray.push(verificationCode);
  await env.VERIFICATION_CODES.put(`user:${userId}`, JSON.stringify(codesArray), { expirationTtl: 600 });
  
  // Create a button for modal verification
  return respond({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `🔐 **Verification Process**\n\nYour verification code is: **${verificationCode}**\n\nClick the button below to enter your code and complete verification.`,
      flags: MessageFlags.EPHEMERAL,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              label: "Enter Verification Code",
              style: 1,
              custom_id: "open_verify_modal"
            }
          ]
        }
      ]
    }
  });
}

async function handleVerifyModalCommand(interaction, env) {
  // Return a modal for verification
  return respond({
    type: InteractionResponseType.MODAL,
    data: {
      custom_id: "verify_modal",
      title: "Account Verification",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "verification_code",
              label: "Verification Code",
              style: 1,
              min_length: 6,
              max_length: 6,
              placeholder: "Enter the 6-digit code sent to you",
              required: true
            }
          ]
        }
      ]
    }
  });
}

async function handleSetupCommand(interaction, env) {
  // Check if user has admin permissions
  if (!interaction.member.permissions.includes('ADMINISTRATOR')) {
    return respond({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'You need administrator permissions to use this command.',
        flags: MessageFlags.EPHEMERAL
      }
    });
  }
  
  // Create verification channel message
  const verificationMessage = {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `🔐 **Server Verification**\n\nTo gain access to this server, you need to verify your account.\n\n**How to verify:**\n1. Use the \`/verify\` command\n2. You'll receive a verification code\n3. Enter the code when prompted\n4. Get your verified role automatically!\n\nNeed help? Contact server staff.`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              label: "Start Verification",
              style: 1,
              custom_id: "open_verify_modal"
            }
          ]
        }
      ]
    }
  };
  
  return respond(verificationMessage);
}

async function handleModalSubmit(interaction, env) {
  const { custom_id } = interaction.data;
  
  if (custom_id === "verify_modal") {
    return handleVerificationSubmit(interaction, env);
  }
  
  return respond({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: 'Unknown modal submission',
      flags: MessageFlags.EPHEMERAL
    }
  });
}

async function handleVerificationSubmit(interaction, env) {
  const { components } = interaction.data;
  const codeComponent = components[0].components[0];
  const verificationCode = codeComponent.value.trim();
  const userId = interaction.member.user.id;
  const username = interaction.member.user.username;
  
  console.log(`Verifying code: ${verificationCode} for user: ${userId}`);
  
  // Check if the code exists in KV
  const storedUserId = await env.VERIFICATION_CODES.get(`code:${verificationCode}`);
  
  if (!storedUserId) {
    return respond({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ Invalid or expired verification code. Please run `/verify` again to get a new code.',
        flags: MessageFlags.EPHEMERAL
      }
    });
  }
  
  if (storedUserId !== userId) {
    return respond({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ This verification code was not generated for your account.',
        flags: MessageFlags.EPHEMERAL
      }
    });
  }
  
  // Code is valid - assign verified role
  try {
    const success = await addRoleToUser(env, userId, env.VERIFIED_ROLE_ID);
    
    if (success) {
      // Clean up - delete the used code
      await env.VERIFICATION_CODES.delete(`code:${verificationCode}`);
      
      // Remove from user's codes list
      const userCodes = await env.VERIFICATION_CODES.get(`user:${userId}`) || '[]';
      const codesArray = JSON.parse(userCodes).filter(code => code !== verificationCode);
      await env.VERIFICATION_CODES.put(`user:${userId}`, JSON.stringify(codesArray), { expirationTtl: 600 });
      
      // Send welcome message
      await sendWelcomeMessage(env, userId, username);
      
      return respond({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '✅ **Verification Successful!**\n\nYou now have access to all channels in the server. Welcome! 🎉',
          flags: MessageFlags.EPHEMERAL
        }
      });
    } else {
      throw new Error('Failed to add role');
    }
  } catch (error) {
    console.error('Error during verification:', error);
    return respond({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: '❌ Failed to complete verification. Please contact an administrator for help.',
        flags: MessageFlags.EPHEMERAL
      }
    });
  }
}

// Helper function to add role to user
async function addRoleToUser(env, userId, roleId) {
  const response = await fetch(
    `https://discord.com/api/v10/guilds/${env.GUILD_ID}/members/${userId}/roles/${roleId}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      }
    }
  );
  
  if (response.ok) {
    console.log(`Successfully added role ${roleId} to user ${userId}`);
    return true;
  } else {
    console.error(`Failed to add role: ${response.status} ${response.statusText}`);
    return false;
  }
}

// Helper function to send welcome message
async function sendWelcomeMessage(env, userId, username) {
  try {
    // Create DM channel
    const dmResponse = await fetch(
      `https://discord.com/api/v10/users/@me/channels`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient_id: userId
        })
      }
    );
    
    if (dmResponse.ok) {
      const dmChannel = await dmResponse.json();
      
      // Send welcome message
      await fetch(
        `https://discord.com/api/v10/channels/${dmChannel.id}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: `🎉 **Welcome to the server, ${username}!**\n\nYour verification was successful! You now have full access to the server. Feel free to explore and introduce yourself!`
          })
        }
      );
    }
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
}

// Generate a random 6-digit verification code
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper function to create responses
function respond(response) {
  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Handle component interactions (buttons)
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === 'POST') {
    const url = new URL(request.url);
    const body = await request.text();
    const interaction = JSON.parse(body);
    
    // Handle button clicks
    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
      if (interaction.data.custom_id === 'open_verify_modal') {
        return respond({
          type: InteractionResponseType.MODAL,
          data: {
            custom_id: "verify_modal",
            title: "Account Verification",
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 4,
                    custom_id: "verification_code",
                    label: "Verification Code",
                    style: 1,
                    min_length: 6,
                    max_length: 6,
                    placeholder: "Enter the 6-digit code from /verify",
                    required: true
                  }
                ]
              }
            ]
          }
        });
      }
    }
  }
  
  return new Response('Not found', { status: 404 });
}
