# Client Messages

Transient notifications authored by frontend features. Messages exist only in the current browser session and have no RPC, shared protocol, or persistence dependency.

## Structure

- `messageStore.ts` owns message order, retention, unread state, and clearing.
- `MessageBar.vue` exposes the latest message and opens the panel.
- `MessagePanel.vue` renders and clears the message history.

## Contracts

- Messages append in creation order and retain only the latest 100 entries.
- Opening the panel marks all messages as read. Clearing resets both messages and unread state.