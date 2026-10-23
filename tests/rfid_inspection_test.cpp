#include <cassert>
#include <stdint.h>
#include "../firmware/esp32_cam_doorbell/include/rfid_inspection.h"
static RfidInspection::Result command(RfidInspection& state,const char* text,uint32_t now){auto result=RfidInspection::Result::None;while(*text)result=state.feed(*text++,now);return result;}
int main(){
 RfidInspection state;
 assert(!state.active(0));
 assert(command(state,"RFID INSPECT\n",100)==RfidInspection::Result::Armed);
 assert(state.active(60099));assert(!state.active(60100));
 assert(command(state,"rfid inspect\r\n",1000)==RfidInspection::Result::None);
 assert(state.active(1001));
 assert(command(state,"RFID EXIT\n",1002)==RfidInspection::Result::Exited);assert(!state.active(1002));
 assert(command(state,"RFID ENROLL\n",1003)==RfidInspection::Result::Invalid);assert(!state.active(1004));
 command(state,"XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXRFID INSPECT\n",1005);assert(!state.active(1006));
 command(state,"RFID INSPECT\n",0xfffffff0u);assert(state.active(100));assert(!state.active(60000));
 assert(command(state,"RFID ENROLL F909F41F\n",100)==RfidInspection::Result::EnrollArmed);
 assert(state.enrollmentActive(101));assert(!state.active(101));assert(strcmp(state.targetUid(),"F909F41F")==0);
 command(state,"RFID ENROLL BAD\n",102);assert(!state.enrollmentActive(103));
 command(state,"RFID ENROLL 9A130156\n",200);assert(!state.enrollmentActive(60200));
 command(state,"RFID ENROLL 9A130156\n",300);command(state,"RFID INSPECT\n",301);assert(!state.enrollmentActive(302));
 command(state,"RFID ENROLL F909F41F\n",400);command(state,"RFID EXIT\n",401);assert(!state.enrollmentActive(402));
 assert(command(state,"RFID ENABLE\n",500)==RfidInspection::Result::Enable);
 assert(command(state,"RFID DISABLE\n",501)==RfidInspection::Result::Disable);
}
