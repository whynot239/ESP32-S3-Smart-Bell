import fs from 'node:fs';
import path from 'node:path';

export function createPushService(directory, accessToken = '', fetcher = fetch) {
  const filename = path.join(directory, 'push-tokens.json');
  const tokens = new Set(fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename,'utf8')) : []);
  const save = () => { fs.writeFileSync(filename+'.tmp',JSON.stringify([...tokens])); fs.renameSync(filename+'.tmp',filename); };
  async function post(endpoint, body) {
    const response = await fetcher('https://exp.host/--/api/v2/push/'+endpoint, {
      method:'POST', headers:{'Content-Type':'application/json',...(accessToken ? {Authorization:`Bearer ${accessToken}`} : {})},
      body:JSON.stringify(body), signal:AbortSignal.timeout(10000)
    });
    if(!response.ok) throw new Error(`Push service returned ${response.status}`);
    return response.json();
  }
  return {
    register(token, enabled=true) {
      if(typeof token !== 'string' || !/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(token)) throw new Error('Invalid push token');
      if(enabled && !tokens.has(token) && tokens.size>=20) throw new Error('Device limit reached');
      if(enabled) tokens.add(token); else tokens.delete(token);
      save();
    },
    async notify(title, body, data) {
      if(!tokens.size) return;
      const recipients=[...tokens];
      try {
        const result=await post('send',recipients.map(to=>({to,title,body,data,sound:'default',priority:'high',channelId:'doorbell-ring',ttl:60})));
        const tickets=Array.isArray(result.data)?result.data:[];
        const pending=new Map();
        tickets.forEach((ticket,i)=>{if(ticket.status==='ok'&&ticket.id)pending.set(ticket.id,recipients[i]);else if(ticket.details?.error==='DeviceNotRegistered')tokens.delete(recipients[i]);});
        save();
        if(pending.size) {
          const timer=setTimeout(async()=>{
            try {
              const result=await post('getReceipts',{ids:[...pending.keys()]});
              for(const [id,receipt] of Object.entries(result.data||{})) {
                if(receipt.details?.error==='DeviceNotRegistered') tokens.delete(pending.get(id));
                if(receipt.status==='error') console.warn('[PUSH] Receipt failed:',receipt.details?.error||'unknown');
              }
              save();
            } catch(error) { console.warn('[PUSH] Receipt unavailable:',error.message); }
          },15*60*1000); timer.unref();
        }
      } catch(error) { console.warn('[PUSH] Delivery request failed:',error.message); }
    }
  };
}
