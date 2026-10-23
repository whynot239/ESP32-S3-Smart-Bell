import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validDeviceSettings,normalizeCards,readTelemetry} from '../dashboard-support.js';
import {filterEvents,eventTitle,eventsCsv} from '../public/dashboard-data.js';
test('device setting limits reject invalid types and values',()=>{
 const valid={version:1,idleBrightness:8,activeBrightness:120,speakerGain:4};assert.ok(validDeviceSettings(valid));
 for(const [key,bad] of [['version',2],['idleBrightness',65],['idleBrightness',-1],['activeBrightness',121],['speakerGain',7],['speakerGain',1.5],['speakerGain','4']])assert.ok(!validDeviceSettings({...valid,[key]:bad}));
 assert.ok(validDeviceSettings({...valid,idleBrightness:0,activeBrightness:0,speakerGain:0}));
});
test('card validation preserves explicit permission and rejects duplicates',()=>{
 const card={uid:'f9:09:f4:1f',name:' White card ',userId:'owner',permission:'gate_access',active:true};
 assert.equal(normalizeCards([card])[0].uid,'F909F41F');assert.equal(normalizeCards([card])[0].name,'White card');
 assert.throws(()=>normalizeCards([card,{...card,uid:'F909F41F'}]));
 for(const change of [{active:undefined},{uid:'BAD'},{permission:'admin'},{name:''}])assert.throws(()=>normalizeCards([{...card,...change}]));
});
test('telemetry is whitelisted and supports older firmware without fake readings',()=>{
 const old=readTelemetry({rssi:-60});assert.equal(old.settings,null);assert.equal(old.freeHeap,null);
 const value=readTelemetry({freeHeap:40000,storageReady:true,secret:'never-copy'});assert.equal(value.freeHeap,40000);assert.equal(value.storageReady,true);assert.ok(!('secret' in value));
});
test('activity filters show friendly names and exports prevent spreadsheet formulas',()=>{
 const now=Date.now(),events=[{type:'ring',timestamp:now,userName:'=malicious'},{type:'nfc_access',timestamp:now-864000000,cardUid:'F909F41F'},{type:'unauthorized_attempt',timestamp:now}];
 assert.equal(filterEvents(events,{kind:'ring'}).length,1);assert.equal(filterEvents(events,{days:'1',now}).length,2);assert.equal(filterEvents(events,{query:'f909'}).length,1);
 assert.equal(eventTitle(events[2]),'Card access denied');assert.ok(eventsCsv(events).includes("'=malicious"));
});
