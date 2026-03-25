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

// input poi as fetched from wikidata

export async function askClaude(poi) {

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
        content: getPrompt(poi)
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

function getPrompt(poi) {

  return(`
    You are a friendly local resident.
    Please write a short paragraph introducing me to the point of interest in the JSON object below. 
    What is it, a few fun facts, just enough to get me interested.
    Be concise, not a lot of exclamation points, but engaging. 
    This will be read aloud so please keep that in mind. 
    The listener will be driving in the area but may not be right at the location,
    so avoid phrases like 'in front of you' or 'to the east.'
    Avoid trite phrases like 'worth a closer look' or 'hidden gem.'
    Return only the paragraph itself. ${JSON.stringify(poi)} `
  );
}

