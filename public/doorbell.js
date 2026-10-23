import {eventKind,eventTitle,eventTime,filterEvents,eventsCsv} from '/dashboard-data.js';
const $=id=>document.getElementById(id);
const paths={bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',camera:'M14 7H4v12h16V7h-4l-2-3h-4L8 7 M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',history:'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',card:'M3 5h18v14H3z M3 9h18 M6 15h4',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',pulse:'M3 12h4l3-8 4 16 3-8h4',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1',arrow:'M5 12h14 M13 6l6 6-6 6',alert:'M12 3 2 21h20z M12 9v5 M12 17v1',play:'m9 5 11 7-11 7z',mic:'M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M9 22h6',volume:'M11 4 6 8H3v8h3l5 4z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14',unlock:'M7 11V7a5 5 0 0 1 9-3 M5 11h14v10H5z M12 15v2',shield:'m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6z M8 12l3 3 5-6',refresh:'M20 7a9 9 0 1 0 1 8 M20 2v6h-6',search:'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M15 15l6 6',plus:'M12 4v16 M4 12h16'};
function icon(name){const span=document.createElement('span');span.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.pulse}"/></svg>`;return span;}
document.querySelectorAll('[data-icon]').forEach(item=>item.replaceChildren(icon(item.dataset.icon).firstChild));
const defaults={appearance:'system',doorName:'Front door',timeFormat:'24',timeZone:'local',receiveVolume:100};
let preferences={...defaults};
try{const saved=JSON.parse(localStorage.getItem('smartbell.preferences')||'{}');for(const key of Object.keys(defaults))if(typeof saved[key]===typeof defaults[key])preferences[key]=saved[key];}catch{}
if(!['system','light','dark'].includes(preferences.appearance))preferences.appearance='system';
if(!['local','Asia/Karachi','UTC'].includes(preferences.timeZone))preferences.timeZone='local';
preferences.receiveVolume=Math.max(0,Math.min(100,preferences.receiveVolume));preferences.doorName=preferences.doorName.slice(0,40)||'Front door';
const systemTheme=matchMedia('(prefers-color-scheme: dark)');
function applyPreferences(){document.documentElement.dataset.theme=preferences.appearance==='system'?(systemTheme.matches?'dark':'light'):preferences.appearance;$('appearance').value=preferences.appearance;$('doorName').value=preferences.doorName;$('timeFormat').value=preferences.timeFormat;$('timeZone').value=preferences.timeZone;$('receiveVolume').value=preferences.receiveVolume;document.title=preferences.doorName+' · Smart Bell';if(currentView==='live')$('pageTitle').textContent=preferences.doorName;}
function storePreferences(){try{localStorage.setItem('smartbell.preferences',JSON.stringify(preferences));}catch{message('Preferences could not be saved in this browser.');}}
let token=new URLSearchParams(location.hash.slice(1)).get('token')||'';
history.replaceState(null,'',location.pathname);
let state={},socket,context,mic,worklet,playback,receiveGain,source,renewal,polling,imageUrl,microphoneEnabled=false,pendingAction;
let sessionGeneration=0,cardsLoading=false;
let currentView='live',allEvents=[],eventPage=0,diagnostics=null,cardDraft=[],cardsLoaded=false,cardsDirty=false,settingsDirty=false,refreshing=false,toastTimer,photoUrl;
const clientEvents=[];
function message(text){$('message').textContent=text;$('message').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('message').hidden=true,8000);clientEvents.unshift({time:new Date().toISOString(),message:text});clientEvents.splice(30);}
function formatTime(timestamp,short=false){if(!timestamp)return 'Recorded offline';return new Intl.DateTimeFormat(undefined,{...(short?{hour:'numeric',minute:'2-digit'}:{dateStyle:'medium',timeStyle:'short'}),hour12:preferences.timeFormat==='12',...(preferences.timeZone==='local'?{}:{timeZone:preferences.timeZone})}).format(timestamp);}
function duration(seconds){if(!Number.isFinite(seconds))return 'Not reported';return seconds>=86400?`${Math.floor(seconds/86400)}d ${Math.floor(seconds%86400/3600)}h`:seconds>=3600?`${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`:`${Math.floor(seconds/60)}m ${Math.floor(seconds%60)}s`;}
async function request(route,data){const response=await fetch(route,{method:data?'POST':'GET',cache:'no-store',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(10000)});const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||`Request failed (${response.status})`);return result;}
function showView(view){if(!['live','activity','cards','settings','diagnostics'].includes(view))return;if(currentView==='live'&&view!=='live')end();currentView=view;document.querySelectorAll('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel!==view);document.querySelectorAll('[data-view]').forEach(button=>{if(button.dataset.view===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});const headings={live:[preferences.doorName,'A little closer to home.'],activity:['Activity','Know what happened at your entrance.'],cards:['Cards & access','Simple permissions. Offline access.'],settings:['Settings','Make your doorbell feel right for home.'],diagnostics:['Diagnostics','A clear view of how your system is doing.']};$('pageTitle').textContent=headings[view][0];$('pageSubtitle').textContent=headings[view][1];if(token){if(view==='cards'&&!cardsLoaded)loadCards();if(view==='diagnostics')loadDiagnostics();}history.replaceState(null,'',location.pathname+'#'+view);}
function renderStatus(){const online=state.status==='online';$('previewNotice').hidden=state.preview!==true;$('deviceStatus').textContent=online?'Doorbell online':'Doorbell offline';$('deviceStatus').classList.toggle('online',online);$('serviceDot').classList.add('online');$('connection').textContent='Service connected';$('alarmBanner').hidden=!online||!state.alarmActive;$('fault').hidden=!online||state.relayFault===false;$('fault').textContent='Relay output is uncertain. Check the device before operating the gate.';for(const id of ['unlock','chime','light','disarm','disarmBanner','cards'])$(id).disabled=!online||(id==='unlock'&&state.relayFault!==false)||(id==='cards'&&typeof state.cardsEnabled!=='boolean');$('start').disabled=!online||!!socket;$('cardBadge').textContent=typeof state.cardsEnabled!=='boolean'?'Unknown':state.cardsEnabled?'Enabled':'Paused';$('cardBadge').classList.toggle('enabled',state.cardsEnabled===true);$('cardStatus').textContent=!online?'Connect the ESP to check card access.':state.cardsEnabled?'Enrolled, active cards can unlock the gate.':'Card access is paused. Tapping a tag can trigger the security alarm.';$('cards').textContent=state.cardsEnabled?'Pause card access':'Enable card access';$('lightLabel').textContent=state.porchLight==='on'?'Turn porch light off':'Turn porch light on';const settings=state.telemetry?.settings;$('deviceSettingsFields').disabled=!online||!settings;$('settingsCompatibility').hidden=online&&!!settings;$('settingsCompatibility').textContent=!online?'The ESP must be online to change these settings.':'Install the rc6 firmware update to adjust lights and speech volume.';if(settings&&!settingsDirty){for(const key of ['idleBrightness','activeBrightness','speakerGain'])$(key).value=settings[key];renderSettingLabels();}$('lastUpdated').textContent='Updated '+formatTime(Date.now(),true);}
async function refresh(){if(refreshing||!token)return;refreshing=true;const generation=sessionGeneration;try{const status=await request('/status');if(generation!==sessionGeneration)return;state=status;renderStatus();try{const [access,security]=await Promise.all([request('/api/access_history'),request('/api/security_history')]);if(generation!==sessionGeneration)return;allEvents=[...new Map([...access,...security].map(event=>[event.eventId,event])).values()].sort((a,b)=>eventTime(b)-eventTime(a));renderEvents();}catch(error){message('Activity could not refresh: '+error.message);}}catch(error){state={status:'offline',cardsEnabled:null};renderStatus();$('connection').textContent='Service unavailable';$('serviceDot').classList.remove('online');$('deviceStatus').textContent='Status unavailable';message(error.message);}finally{refreshing=false;}}
async function connect(){const candidate=$('token').value.trim()||token;if(!candidate)return;token=candidate;sessionGeneration++;$('connect').disabled=true;try{await request('/status');$('setup').hidden=true;$('dashboard').hidden=false;$('disconnect').hidden=false;$('token').value='';await refresh();clearInterval(polling);polling=setInterval(refresh,15000);showView(currentView);}catch(error){message(error.message);}finally{$('connect').disabled=false;}}
function filteredEvents(){return filterEvents(allEvents,{query:$('eventSearch').value,kind:$('eventType').value,days:$('eventPeriod').value});}
function eventRow(event){const row=document.createElement('li');const kind=eventKind(event);const symbol=icon(kind==='ring'?'bell':kind==='security'?'shield':'unlock');symbol.className='event-icon '+kind;const detail=document.createElement('div');detail.className='event-detail';const title=document.createElement('strong');title.textContent=eventTitle(event);const description=document.createElement('small');description.textContent=[event.userName,event.cardUid&&event.cardUid!=='REMOTE'?'Card '+event.cardUid:'',event.offlineSync?'Synced from device':''].filter(Boolean).join(' · ')||'Front entrance';detail.append(title,description);const time=document.createElement('time');time.className='event-time';time.textContent=formatTime(eventTime(event));if(eventTime(event))time.dateTime=new Date(eventTime(event)).toISOString();row.append(symbol,detail,time);if(event.photoUrl){const button=document.createElement('button');button.className='secondary';button.textContent='View photo';button.onclick=()=>showPhoto(event);row.append(button);}return row;}
function fillEvents(target,events){target.replaceChildren(...events.map(eventRow));if(!events.length){const empty=document.createElement('li');empty.className='empty';empty.textContent='No activity matches this view.';target.append(empty);}}
function renderEvents(){fillEvents($('recentEvents'),allEvents.slice(0,5));const filtered=filteredEvents();const pages=Math.max(1,Math.ceil(filtered.length/20));eventPage=Math.min(eventPage,pages-1);fillEvents($('events'),filtered.slice(eventPage*20,eventPage*20+20));$('eventSummary').textContent=`${filtered.length} ${filtered.length===1?'event':'events'} · ${preferences.timeZone==='local'?'Times use this device’s time zone':preferences.timeZone}`;$('eventPage').textContent=`Page ${eventPage+1} of ${pages}`;$('previousEvents').disabled=eventPage===0;$('nextEvents').disabled=eventPage>=pages-1;}
async function showPhoto(event){try{const target=new URL(event.photoUrl,location.origin);if(target.origin!==location.origin||!target.pathname.startsWith('/captures/'))throw Error('Invalid photo location.');const response=await fetch(target,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw Error('This snapshot is no longer available.');if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=URL.createObjectURL(await response.blob());$('eventPhoto').src=photoUrl;$('photoDate').textContent=formatTime(eventTime(event));$('photoDialog').showModal();}catch(error){message(error.message);}}
function download(name,content,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function loadCards(){if(cardsLoading)return;if(cardsDirty&&!confirm('Discard your unsaved card changes and reload from the doorbell?'))return;cardsLoading=true;const generation=sessionGeneration;$('loadCards').disabled=true;$('cardEditor').inert=true;try{const result=await request('/api/cards');if(generation!==sessionGeneration)return;cardDraft=result.cards.map(card=>({...card}));cardsLoaded=true;cardsDirty=false;$('cardEditor').hidden=false;$('cardWarning').textContent='Loaded from the doorbell at '+formatTime(Date.now(),true)+'. Changes are applied only after you save with your PIN.';renderCards();}catch(error){$('cardWarning').textContent=error.message;message(error.message);}finally{if(generation===sessionGeneration){cardsLoading=false;$('loadCards').disabled=false;$('cardEditor').inert=false;}}}
function dirtyCards(){cardsDirty=true;$('cardSaveStatus').textContent='Unsaved card changes';$('saveCards').disabled=false;}
function renderCards(){$('cardRows').replaceChildren();$('cardCount').textContent=`${cardDraft.length} of 100 card records`;$('addCard').disabled=cardDraft.length>=100;cardDraft.forEach((card,index)=>{const row=document.createElement('div');row.className='card-item';const nameLabel=document.createElement('label');const name=document.createElement('input');name.value=card.name;name.maxLength=80;name.setAttribute('aria-label','Name for card '+card.uid);name.oninput=()=>{card.name=name.value;dirtyCards();};nameLabel.append(name);const uid=document.createElement('small');uid.textContent='UID '+card.uid;const toggleLabel=document.createElement('label');const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=card.active;toggle.onchange=()=>{card.active=toggle.checked;dirtyCards();};toggleLabel.append(toggle,document.createTextNode('Allow access'));const remove=document.createElement('button');remove.className='text-button remove-card';remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+card.name);remove.onclick=()=>{cardDraft.splice(index,1);dirtyCards();renderCards();};row.append(nameLabel,uid,toggleLabel,remove);$('cardRows').append(row);});$('saveCards').disabled=!cardsDirty;$('cardSaveStatus').textContent=cardsDirty?'Unsaved card changes':'No unsaved changes';if(!cardDraft.length)$('cardRows').textContent='No card records saved. Enroll a tag over USB, then reload this list.';}
function renderSettingLabels(){$('idleValue').textContent=Math.round(Number($('idleBrightness').value)/255*100)+'%';$('activeValue').textContent=Math.round(Number($('activeBrightness').value)/255*100)+'%';$('speakerValue').textContent=Number($('speakerGain').value)===0?'Muted':'Level '+$('speakerGain').value+' of 6';}
async function loadDiagnostics(){$('refreshDiagnostics').disabled=true;try{diagnostics=await request('/api/diagnostics');const telemetry=diagnostics.telemetry||{};$('diagnosticNotice').textContent=diagnostics.deviceOnline?'ESP connected. Values below are from its latest heartbeat.':'The ESP is offline. Values below, if present, were last reported before disconnecting.';const known=value=>value===true?'Ready':value===false?'Unavailable':'Not reported';const memory=value=>Number.isFinite(value)?(value/1024).toFixed(0)+' KB':'Not reported';const facts=[['Firmware',diagnostics.firmware||telemetry.firmware||'Not reported'],['Hardware',diagnostics.hardware||'Not reported'],['Wi-Fi signal',Number.isFinite(state.rssi)?state.rssi+' dBm':'Not reported'],['Device uptime',duration(telemetry.uptimeSec)],['Server uptime',duration(diagnostics.serverUptimeSec)],['Last heartbeat',formatTime(diagnostics.lastHeartbeat)],['Free internal memory',memory(telemetry.freeHeap)],['Free PSRAM',memory(telemetry.freePsram)],['Queued events',telemetry.pendingEvents??'Not reported'],['Saved card records',telemetry.cardsCached??'Not reported'],['Storage',known(telemetry.storageReady)],['Camera',known(telemetry.cameraReady)],['Audio engine',known(telemetry.audioReady)],['Relay output',state.status!=='online'?'Unknown while offline':state.relayFault?'Fault reported':'No fault reported'],['Card access',typeof state.cardsEnabled!=='boolean'?'Unknown':state.cardsEnabled?'Enabled':'Paused']];$('diagnosticFacts').replaceChildren(...facts.map(([key,value])=>{const pair=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');term.textContent=key;description.textContent=value;pair.append(term,description);return pair;}));$('commandResults').replaceChildren(...diagnostics.commands.map(item=>{const row=document.createElement('li'),detail=document.createElement('div'),time=document.createElement('time');detail.className='event-detail';const label=document.createElement('strong');label.textContent=item.action.replaceAll('_',' ');const result=document.createElement('small');result.textContent=item.result==='confirmed'?'Device confirmed':item.result==='rejected'?'Device rejected':item.result==='offline'?'Device offline':'No confirmation received';detail.append(label,result);time.className='event-time';time.textContent=formatTime(item.timestamp);row.append(detail,time);return row;}));if(!diagnostics.commands.length)$('commandResults').textContent='No commands recorded since the server started.';}catch(error){$('diagnosticNotice').textContent=error.message;message(error.message);}finally{$('refreshDiagnostics').disabled=false;}}

function end() {
  clearInterval(renewal); renewal=null;
  if(socket) { socket.onclose=null; socket.close(); socket=null; }
  mic?.getTracks().forEach(track=>track.stop()); mic=null; worklet?.disconnect(); source?.disconnect(); worklet=null; source=null;
  playback?.disconnect(); playback=null; receiveGain?.disconnect(); receiveGain=null;
  context?.close(); context=null; microphoneEnabled=false;
  $('talk').disabled=true; $('talkLabel').textContent='Enable microphone'; $('talk').setAttribute('aria-pressed','false');
  $('end').disabled=true; $('start').disabled=state.status!=='online';$('liveDot').classList.remove('online'); $('mediaStatus').textContent='Session ended';
  $('video').hidden=true; $('placeholder').hidden=false;
  if(imageUrl) URL.revokeObjectURL(imageUrl); imageUrl=null;
}
async function start() {
  end(); $('start').disabled=true;
  let callContext=null;
  try {
    context=new AudioContext();
    callContext=context;
    await callContext.resume();
    if(context!==callContext)return;
    await callContext.audioWorklet.addModule('/playback-worklet.js');
    if(context!==callContext)return;
    playback=new AudioWorkletNode(callContext,'doorbell-playback',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});
    receiveGain=callContext.createGain();receiveGain.gain.value=preferences.receiveVolume/100;
    playback.connect(receiveGain);receiveGain.connect(callContext.destination);
    socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/media?token=${encodeURIComponent(token)}`);
    socket.binaryType='arraybuffer';
    socket.onopen=()=>{$('liveDot').classList.add('online');socket.send(JSON.stringify({type:'watch'})); renewal=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN) socket.send(JSON.stringify({type:'watch'}));},15000); $('end').disabled=false; $('talk').disabled=false; $('mediaStatus').textContent='Waiting for camera frames…';};
    socket.onmessage=({data})=>{
      if(typeof data==='string') {const info=JSON.parse(data); if(info.type==='error') {message(info.message);end();} return;}
      if(!data.byteLength)return;
      const view=new DataView(data);
      if(view.getUint8(0)===1) {
        const next=URL.createObjectURL(new Blob([data.slice(1)],{type:'image/jpeg'}));
        $('video').src=next; $('video').hidden=false; $('placeholder').hidden=true;
        if(imageUrl) URL.revokeObjectURL(imageUrl); imageUrl=next; $('mediaStatus').textContent='Live · Front entrance';
      } else if(view.getUint8(0)===2 && context) {
        const count=(data.byteLength-1)/2; if(!Number.isInteger(count))return;
        const pcm=new Float32Array(count);
        for(let i=0;i<count;i++) pcm[i]=view.getInt16(1+2*i,true)/32768;
        playback?.port.postMessage(pcm,[pcm.buffer]);
      }
    };
    socket.onclose=()=>{end();message('Intercom disconnected. Start a new session to reconnect.');};
    socket.onerror=()=>message('Could not connect to intercom.');
  } catch(error) { if(context===callContext) {end();message(error.message);} }
}
async function toggleMicrophone() {
  const callContext=context, callSocket=socket;
  const isCurrent=()=>context===callContext && socket===callSocket && callSocket?.readyState===WebSocket.OPEN;
  if (!callContext || !isCurrent() || $('talk').disabled) return;
  let pendingStream, pendingSource, pendingWorklet;
  $('talk').disabled=true;
  try {
    if (!mic) {
      if (!navigator.mediaDevices) throw Error('Microphone access requires HTTPS.');
      pendingStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if (!isCurrent()) { pendingStream.getTracks().forEach(track=>track.stop()); return; }
      await callContext.audioWorklet.addModule('/pcm-worklet.js');
      if (!isCurrent()) { pendingStream.getTracks().forEach(track=>track.stop()); return; }
      pendingSource=callContext.createMediaStreamSource(pendingStream);
      pendingWorklet=new AudioWorkletNode(callContext,'doorbell-pcm');
      // The processor sends captured PCM and emits silence: no local microphone sidetone.
      pendingSource.connect(pendingWorklet); pendingWorklet.connect(callContext.destination);
      pendingWorklet.port.onmessage=({data})=>{
        if (isCurrent() && microphoneEnabled && callSocket.bufferedAmount<32768) callSocket.send(data);
      };
      mic=pendingStream; source=pendingSource; worklet=pendingWorklet;
      pendingStream=null; pendingSource=null; pendingWorklet=null;
      mic.getAudioTracks().forEach(track=>{
        track.onended=()=>{
          if (!isCurrent()) return;
          microphoneEnabled=false;
          mic?.getTracks().forEach(item=>item.stop()); mic=null;
          source?.disconnect(); worklet?.disconnect(); source=null; worklet=null;
          $('talkLabel').textContent='Enable microphone'; $('talk').setAttribute('aria-pressed','false');
          message('Your microphone stopped. You can still hear the visitor.');
        };
      });
    }
    microphoneEnabled=!microphoneEnabled;
    mic.getAudioTracks().forEach(track=>track.enabled=microphoneEnabled);
    $('talkLabel').textContent=microphoneEnabled?'Mute microphone':'Unmute microphone';
    $('talk').setAttribute('aria-pressed',String(microphoneEnabled));
  } catch(error) {
    pendingStream?.getTracks().forEach(track=>track.stop());
    pendingSource?.disconnect(); pendingWorklet?.disconnect();
    if (isCurrent()) message(error.message);
  } finally {
    if (isCurrent()) $('talk').disabled=false;
  }
}



function ask(title,action,description='Enter your owner account and PIN to confirm.'){pendingAction=action;$('pinTitle').textContent=title;$('pinDescription').textContent=description;$('pin').value='';$('pinError').hidden=true;$('pinDialog').showModal();$('pin').focus();}
$('pinForm').onsubmit=async event=>{event.preventDefault();$('confirm').disabled=true;$('cancel').disabled=true;$('confirm').textContent='Waiting for device…';$('pinError').hidden=true;try{await pendingAction({username:$('username').value.trim(),pin:$('pin').value});$('pinDialog').close();message('Device confirmed the request.');await refresh();}catch(error){$('pinError').textContent=error.message;$('pinError').hidden=false;}finally{$('confirm').disabled=false;$('cancel').disabled=false;$('confirm').textContent='Confirm';$('pin').value='';}};
$('pinDialog').addEventListener('cancel',event=>{if($('confirm').disabled)event.preventDefault();});
$('pinDialog').addEventListener('close',()=>{$('pin').value='';pendingAction=null;});$('cancel').onclick=()=>$('pinDialog').close();
$('connectForm').onsubmit=event=>{event.preventDefault();connect();};$('refresh').onclick=refresh;$('start').onclick=start;$('end').onclick=end;$('talk').onclick=toggleMicrophone;
$('unlock').onclick=()=>ask('Unlock gate',auth=>request('/api/unlock',auth),'This sends a short unlock pulse to the real gate.');
const disarm=()=>ask('Disarm alarm',auth=>request('/api/disarm',auth));$('disarm').onclick=disarm;$('disarmBanner').onclick=disarm;
$('cards').onclick=()=>{const enabled=!state.cardsEnabled;ask(enabled?'Enable card access':'Pause card access',auth=>request('/api/cards_enabled',{...auth,enabled}),enabled?'Enrolled cards marked Allow access will be able to unlock the gate.':'All RFID cards will be refused until access is enabled again.');};
for(const [id,command]of[['chime','chime'],['light','light_set']])$(id).onclick=async()=>{$(id).disabled=true;try{await request('/api/control',{command,state:state.porchLight==='on'?'off':'on'});await refresh();message('Doorbell confirmed the control request.');}catch(error){message(error.message);}finally{$(id).disabled=state.status!=='online';}};
document.querySelectorAll('[data-view],[data-go]').forEach(button=>button.onclick=()=>showView(button.dataset.view||button.dataset.go));
for(const id of ['eventSearch','eventType','eventPeriod'])$(id).addEventListener('input',()=>{eventPage=0;renderEvents();});
$('previousEvents').onclick=()=>{eventPage--;renderEvents();};$('nextEvents').onclick=()=>{eventPage++;renderEvents();};$('exportEvents').onclick=()=>download('smart-bell-activity.csv','\ufeff'+eventsCsv(filteredEvents()),'text/csv;charset=utf-8');
$('closePhoto').onclick=()=>$('photoDialog').close();$('photoDialog').addEventListener('close',()=>{if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=null;$('eventPhoto').removeAttribute('src');});
$('loadCards').onclick=loadCards;$('addCard').onclick=()=>{$('addCardForm').hidden=false;$('newCardName').focus();};$('cancelAddCard').onclick=()=>{$('addCardForm').hidden=true;};
$('addCardForm').onsubmit=event=>{event.preventDefault();const uid=$('newCardUid').value.replaceAll(':','').trim().toUpperCase();if(!/^(?:[A-F0-9]{8}|[A-F0-9]{14}|[A-F0-9]{20})$/.test(uid))return message('Enter a valid card UID. Your two tags have 8 hexadecimal characters.');if(cardDraft.some(card=>card.uid===uid))return message('That card is already in the list.');if(cardDraft.length>=100)return message('The device supports at most 100 card records.');cardDraft.push({uid,name:$('newCardName').value.trim(),userId:'owner',permission:'gate_access',active:true});dirtyCards();renderCards();$('addCardForm').reset();$('addCardForm').hidden=true;};
$('saveCards').onclick=()=>{if(!cardsLoaded)return;if(cardDraft.some(card=>!card.name.trim()))return message('Give each card a name before saving.');const cards=cardDraft.map(card=>({...card}));ask('Save card changes',async auth=>{await request('/api/sync_cards',{...auth,cards});cardsDirty=false;renderCards();},`Replace the device’s saved list with these ${cards.length} card records. Removed or disabled records will no longer grant access.`);};
$('savePreferences').onclick=()=>{preferences={...preferences,doorName:$('doorName').value.trim().slice(0,40)||'Front door',appearance:$('appearance').value,timeFormat:$('timeFormat').value,timeZone:$('timeZone').value};storePreferences();applyPreferences();renderEvents();message('Browser preferences saved.');};
$('themeToggle').onclick=()=>{preferences.appearance=document.documentElement.dataset.theme==='dark'?'light':'dark';storePreferences();applyPreferences();};systemTheme.addEventListener('change',()=>{if(preferences.appearance==='system')applyPreferences();});
$('receiveVolume').oninput=()=>{preferences.receiveVolume=Number($('receiveVolume').value);if(receiveGain)receiveGain.gain.value=preferences.receiveVolume/100;storePreferences();};
for(const key of ['idleBrightness','activeBrightness','speakerGain'])$(key).oninput=()=>{settingsDirty=true;renderSettingLabels();};
$('deviceSettingsForm').onsubmit=event=>{event.preventDefault();if($('deviceSettingsFields').disabled)return;const settings={version:1,idleBrightness:Number($('idleBrightness').value),activeBrightness:Number($('activeBrightness').value),speakerGain:Number($('speakerGain').value)};ask('Save lights & sound',async auth=>{await request('/api/device_settings',{...auth,settings});settingsDirty=false;},'The ESP will save these levels and apply them immediately. Alarm and chime tone volume stays unchanged.');};
$('refreshDiagnostics').onclick=async()=>{await refresh();await loadDiagnostics();};$('exportDiagnostics').onclick=async()=>{await loadDiagnostics();if(diagnostics)download('smart-bell-debug.json',JSON.stringify({generatedAt:new Date().toISOString(),deviceStatus:state,diagnostics,clientMessages:clientEvents},null,2));};
$('disconnect').onclick=()=>{sessionGeneration++;end();clearInterval(polling);token='';state={};diagnostics=null;allEvents=[];cardDraft=[];cardsLoading=false;$('loadCards').disabled=false;$('cardEditor').inert=false;cardsLoaded=false;cardsDirty=false;settingsDirty=false;$('dashboard').hidden=true;$('setup').hidden=false;$('disconnect').hidden=true;$('deviceStatus').textContent='Disconnected';$('connection').textContent='Not connected';$('serviceDot').classList.remove('online');$('lastUpdated').textContent='Disconnected';message('Disconnected. Your access token was removed from this tab.');};
$('disconnectSettings').onclick=()=>$('disconnect').click();
document.addEventListener('visibilitychange',()=>{if(document.hidden)end();});window.addEventListener('pagehide',end);
window.addEventListener('beforeunload',event=>{if(cardsDirty){event.preventDefault();event.returnValue='';}});
applyPreferences();renderSettingLabels();if(token)connect();
