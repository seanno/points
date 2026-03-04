//
// CLAUDE.JS
//

import { cfg, dbg } from './config.js';

// +------------+
// | Token Mgmt |
// +------------+

const STORAGE_KEY = 'points_claude_token';

export function getClaudeToken() {
  return(localStorage.getItem(STORAGE_KEY));
}

export function storeClaudeToken(token) {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearClaudeToken() {
  localStorage.removeItem(STORAGE_KEY);
}

// +-----------+
// | askClaude |
// +-----------+

export async function askClaude(title, city, state) {

  const token = getClaudeToken();
  if (!token) return({ error: 'no_token' });
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': token,
      'anthropic-version': cfg('CLAUDE_API_VERSION'),
	  'anthropic-dangerous-direct-browser-access': true
    },
    body: JSON.stringify({
      model: cfg('CLAUDE_MODEL'),
      max_tokens: cfg('CLAUDE_MAX_TOKENS'),
      messages: [{
        role: cfg('CLAUDE_ROLE'),
        content: getPrompt(title, city, state)
      }]
    })
  });

  if (!response.ok) {
	return({ error: response.status });
  }

  const data = await response.json();
  dbg(`claude.response ${JSON.stringify(data)}`);

  return({ response: data.content[0].text });
}

function getPrompt(title, city, state) {

  let poiString = title;
  if (city || state) poiString += ' in ';
  if (city) poiString += city;
  if (city && state) poiString += ', ';
  if (state) poiString += state;
	
  return(`
    You are a friendly, local travel guide. Please write a paragraph
    introducing me to the ${poiString}. What is it, a few fun facts, just 
    enough to get me interested in taking a closer look. Be concise, not
    a lot of exclamation points, but engaging. This will be read aloud so 
    please keep that in mind. Return only the paragraph itself.`
  );
}

