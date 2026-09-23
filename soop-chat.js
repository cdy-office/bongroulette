export function speechCandidates(marbles, target = '') {
  const alive = marbles.filter(m => m.alive);
  if (!target) return alive;
  const key = target.normalize('NFC');
  return alive.filter(m => m.name.normalize('NFC') === key);
}
export function createChatReceiver({ game, command, show, speak = () => false, names = () => [], now = Date.now }) {
  const seen = new Set();
  return {
    clear() { seen.clear(); },
    receive(event) {
      if (!event || typeof event.id !== 'string' || typeof event.text !== 'string' || !Number.isFinite(event.at)) return false;
      if (event.id.length > 160 || now() - event.at > 5000 || event.at - now() > 5000 || seen.has(event.id)) return false;
      seen.add(event.id);
      if (seen.size > 2048) seen.delete(seen.values().next().value);
      const state = game();
      if (!state || state.phase !== 'battle' || state.paused || state.finished) return false;
      const text = event.text.slice(0, 320).replace(/[\u0000-\u001f\u007f]/g, '').trim();
      if (!text) return false;
      if (state.mode === 'gate') {
        if (text !== '!왼' && text !== '!오') return false;
        return command(text, { eventId: event.id, round: state.round });
      }
      if (!['arena', 'race', 'bomb'].includes(state.mode)) return false;
      if (text.startsWith('!')) {
        if (text.startsWith('!(')) {
          const match = text.match(/^!\(([^)]+)\)\s*(.+)$/u);
          if (!match) return false;
          const target = match[1].trim(), message = match[2].trim().slice(0, 80);
          return target && message ? speak(message, target) : false;
        }
        const body = text.slice(1).trim().normalize('NFC');
        const target = [...new Set(names().map(name => name.normalize('NFC')))]
          .filter(name => name && body.startsWith(name) && /^\s+\S/.test(body.slice(name.length)))
          .sort((a, b) => b.length - a.length)[0];
        if (target) return speak(body.slice(target.length).trim().slice(0, 80), target);
        const message = body.slice(0, 80);
        return message ? speak(message) : false;
      }
      show(text);
      return true;
    }
  };
}
