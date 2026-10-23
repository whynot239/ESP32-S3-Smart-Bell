#include <cassert>
#include <cstring>
#include "../firmware/esp32_cam_doorbell/include/classic_credentials.h"
struct Store { ClassicCredential saved{};int writes=0,failAt=0;bool persistedFailure=false;bool save(const ClassicCredential& r){if(++writes==failAt){if(persistedFailure)saved=r;return false;}saved=r;return true;} };
struct Card {
 unsigned char blocks[4][16]{};bool newKeys=false,authenticated=false,authenticatedB=false;int operations=0,failAt=0,loseTrailerAck=0;
 ClassicCredential expected{};
 bool step(){return ++operations!=failAt;}
 bool authenticate(const unsigned char* key,bool b){authenticatedB=b;authenticated=step()&&(!newKeys?b&&key[0]==255:memcmp(key,b?expected.keyB:expected.keyA,6)==0);return authenticated;}
 bool read(unsigned block,unsigned char* out){if(!step()||!authenticated)return false;memcpy(out,blocks[block-60],16);return true;}
 bool write(unsigned block,const unsigned char* in){if(!step()||!authenticated||!authenticatedB)return false;memcpy(blocks[block-60],in,16);if(block==63){newKeys=true;if(loseTrailerAck){loseTrailerAck=0;return false;}}return true;}
 Card(){blocks[3][6]=0x7f;blocks[3][7]=0x07;blocks[3][8]=0x88;blocks[3][9]=0x40;}

};
ClassicCredential record(){ClassicCredential r{};r.magic=CLASSIC_CREDENTIAL_MAGIC;r.version=1;r.state=1;r.uid[0]=0xf9;r.uid[1]=9;r.uid[2]=0xf4;r.uid[3]=0x1f;for(int i=0;i<6;i++){r.keyA[i]=i+1;r.keyB[i]=i+10;}for(int i=0;i<32;i++)r.token[i]=i+30;return r;}
struct Activation {
 bool disabled=false,pending=false,fault=false,metadata=false;int operation=0,failAt=0;
 bool begin(){disabled=true;fault=true;if(++operation==failAt)return false;pending=true;return true;}
 bool saveMetadata(){if(++operation==failAt)return false;metadata=true;return true;}
 bool finish(){if(++operation==failAt)return false;pending=false;fault=false;return true;}
 bool permitsAccess(){return !disabled&&!pending&&!fault&&metadata;}
};
int main(){
 // Recovery accepts either known access profile independently of which B key survived.
 for(int keys=0;keys<2;keys++)for(int access=0;access<2;access++){
   auto pending=record();Card mixed;mixed.expected=pending;mixed.newKeys=keys;
   if(access){mixed.blocks[3][6]=0x78;mixed.blocks[3][7]=0x77;}
   Store recovery;assert(enrollClassicCredential(mixed,recovery,pending,false));
   assert(verifyClassicCredential(mixed,recovery.saved));
 }
 // Metadata may already authorize this UID; every failed activation remains blocked.
 for(int failure=1;failure<=3;failure++){
   auto pending=record();Card target;target.expected=pending;Store disk;
   Activation activation;activation.metadata=true;activation.failAt=failure;
   assert(!completeClassicEnrollment(target,disk,pending,true,activation));
   assert(!activation.permitsAccess());assert(activation.disabled);
 }
 {
   auto pending=record();Card target;target.expected=pending;Store disk;Activation activation;
   assert(completeClassicEnrollment(target,disk,pending,true,activation));
   assert(!activation.permitsAccess()); // Successful enrollment still needs explicit ENABLE.
   activation.disabled=false;assert(activation.permitsAccess());
 }
 {
   auto pending=record();Card target;target.expected=pending;Store disk;Activation activation;
   disk.failAt=2;disk.persistedFailure=true;
   assert(!completeClassicEnrollment(target,disk,pending,true,activation));
   assert(disk.saved.state==2); // Commit applied but acknowledgement/readback failed.
   assert(!activation.permitsAccess() && activation.pending && activation.fault);
   disk.failAt=0;pending=disk.saved;
   assert(completeClassicEnrollment(target,disk,pending,false,activation));
   assert(!activation.permitsAccess());
 }
 auto r=record();Card card;card.expected=r;Store store;
 assert(enrollClassicCredential(card,store,r,true));int enrollmentOperations=card.operations;assert(store.saved.state==2);assert(verifyClassicCredential(card,store.saved));
 auto bad=store.saved;bad.token[0]^=1;assert(!verifyClassicCredential(card,bad));
 bad=store.saved;bad.state=1;assert(!verifyClassicCredential(card,bad));
 Card clone;clone.expected=r;memcpy(clone.blocks,card.blocks,sizeof(card.blocks));assert(!verifyClassicCredential(clone,store.saved));
 // Every failed device operation must leave no active credential and permit recovery.
 for(int fail=1;fail<=enrollmentOperations;fail++){
   auto pending=record();Card interrupted;interrupted.expected=pending;interrupted.failAt=fail;Store disk;
   bool ok=enrollClassicCredential(interrupted,disk,pending,true);
   assert(interrupted.operations>=fail);assert(!ok);
   assert(disk.saved.state!=2);
   if(disk.saved.magic==CLASSIC_CREDENTIAL_MAGIC){interrupted.failAt=0;pending=disk.saved;assert(enrollClassicCredential(interrupted,disk,pending,false));assert(verifyClassicCredential(interrupted,disk.saved));}
 }
 Card occupied;occupied.expected=record();occupied.blocks[0][0]=42;Store none;auto fresh=record();assert(!enrollClassicCredential(occupied,none,fresh,true));assert(none.writes==0);
 Card broken;broken.expected=record();broken.blocks[3][6]^=1;auto wrong=record();assert(!enrollClassicCredential(broken,none,wrong,true));
 Card writeFailure;writeFailure.expected=record();Store unavailable;unavailable.failAt=1;auto p=record();assert(!enrollClassicCredential(writeFailure,unavailable,p,true));assert(!writeFailure.newKeys);assert(writeFailure.blocks[0][0]==0);
 Card commitFailure;commitFailure.expected=record();Store disk;disk.failAt=2;auto q=record();assert(!enrollClassicCredential(commitFailure,disk,q,true));assert(disk.saved.state==1);q=disk.saved;disk.failAt=0;assert(enrollClassicCredential(commitFailure,disk,q,false));
 Card lostAck;lostAck.expected=record();lostAck.loseTrailerAck=1;Store recover;auto partial=record();
 assert(!enrollClassicCredential(lostAck,recover,partial,true));assert(lostAck.newKeys);assert(recover.saved.state==1);
 partial=recover.saved;assert(enrollClassicCredential(lostAck,recover,partial,false));assert(verifyClassicCredential(lostAck,recover.saved));
 auto invalid=recover.saved;invalid.version=2;assert(!verifyClassicCredential(lostAck,invalid));
 invalid=recover.saved;invalid.uid[0]^=1;assert(!verifyClassicCredential(lostAck,invalid));
 unsigned before=lostAck.operations;assert(enrollClassicCredential(lostAck,recover,partial,false));assert(lostAck.operations>before);
}
