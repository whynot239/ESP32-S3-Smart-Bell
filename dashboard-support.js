export function validDeviceSettings(value) {
  return value && value.version === 1 && Number.isInteger(value.idleBrightness) && value.idleBrightness >= 0 && value.idleBrightness <= 64 &&
    Number.isInteger(value.activeBrightness) && value.activeBrightness >= 0 && value.activeBrightness <= 120 &&
    Number.isInteger(value.speakerGain) && value.speakerGain >= 0 && value.speakerGain <= 6;
}
export function normalizeCards(cards) {
  if (!Array.isArray(cards) || cards.length > 100) throw Error('Use at most 100 cards.');
  const seen = new Set();
  return cards.map(card => {
    const uid = typeof card?.uid === 'string' ? card.uid.replaceAll(':','').toUpperCase() : '';
    if (!/^(?:[A-F0-9]{8}|[A-F0-9]{14}|[A-F0-9]{20})$/.test(uid) || seen.has(uid)) throw Error('Card UIDs must be valid and unique.');
    if (typeof card.name !== 'string' || !card.name.trim() || card.name.length > 80 || typeof card.userId !== 'string' || card.userId.length > 80 ||
      card.permission !== 'gate_access' || typeof card.active !== 'boolean') throw Error('Each card needs a name and an explicit access state.');
    seen.add(uid);
    return {uid,name:card.name.trim(),userId:card.userId,permission:'gate_access',active:card.active};
  });
}
export function readTelemetry(msg) {
  const output = {};
  for (const key of ['uptimeSec','freeHeap','freePsram','pendingEvents','cardsCached'])
    output[key] = Number.isSafeInteger(msg[key]) && msg[key] >= 0 ? msg[key] : null;
  for (const key of ['storageReady','cameraReady','audioReady']) output[key] = typeof msg[key] === 'boolean' ? msg[key] : null;
  output.firmware = typeof msg.firmware === 'string' ? msg.firmware.slice(0,80) : null;
  output.settings = validDeviceSettings(msg.settings) ? {version:1,idleBrightness:msg.settings.idleBrightness,activeBrightness:msg.settings.activeBrightness,speakerGain:msg.settings.speakerGain} : null;
  return output;
}
