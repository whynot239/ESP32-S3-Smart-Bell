export function eventKind(event) {
  if (event.type === 'ring' || event.type === 'doorbell_ring') return 'ring';
  if (event.type === 'unauthorized_attempt' || event.authorized === false) return 'security';
  return 'access';
}
export function eventTitle(event) {
  if (eventKind(event)==='ring') return 'Someone rang the doorbell';
  if (eventKind(event)==='security') return 'Card access denied';
  if (event.type==='remote_unlock') return 'Gate unlock requested';
  return 'Card access granted';
}
export function eventTime(event) {return event.timestamp>1700000000000 ? event.timestamp : event.receivedAt || 0;}
export function filterEvents(events,{query='',kind='all',days='all',now=Date.now()}={}) {
  const cutoff=days==='all'?0:now-Number(days)*86400000;
  const search=query.trim().toLowerCase();
  return events.filter(event=>(kind==='all'||eventKind(event)===kind) && (!cutoff||eventTime(event)>=cutoff) &&
    (!search||[eventTitle(event),event.userName,event.cardUid,event.method].join(' ').toLowerCase().includes(search)));
}
export function csvCell(value) {
  let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function eventsCsv(events) {
  return [['Event','Name','Card UID','Time (ISO)','Method'],...events.map(event=>[eventTitle(event),event.userName,event.cardUid,eventTime(event)?new Date(eventTime(event)).toISOString():'Offline device time',event.method])].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
