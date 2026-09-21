import test from 'node:test';
import assert from 'node:assert/strict';
import { isMachineAiIdentity } from '../scripts/machine-ai-web-readiness.mjs';

test('readiness binds the service to the expected checkout and process', () => {
 const identity = { service:'bharatshop-machine-ui', root:'/repo/current', pid:123 };
 assert.equal(isMachineAiIdentity(identity,{root:'/repo/current',pid:123}),true);
 assert.equal(isMachineAiIdentity(identity,{root:'/repo/old',pid:123}),false);
 assert.equal(isMachineAiIdentity(identity,{root:'/repo/current',pid:456}),false);
 assert.equal(isMachineAiIdentity({...identity,service:'unrelated'},{root:'/repo/current'}),false);
 assert.equal(isMachineAiIdentity({...identity,pid:0},{root:'/repo/current'}),false);
 assert.equal(isMachineAiIdentity(identity),false);
});

import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

test('manager refuses a stale PID belonging to an unrelated service', async () => {
 const state = mkdtempSync(join(tmpdir(),'bharatshop-ui-test-'));
 const folder = join(state,'BharatShop','MachineAI','WebUI');mkdirSync(folder,{recursive:true});
 const pidFile=join(folder,'web-ui.pid');writeFileSync(pidFile,String(process.pid));
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'unrelated',root:resolve('.'),pid:process.pid}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await assert.rejects(run(process.execPath,['scripts/machine-ai-web-manager.mjs','stop'],{env:{...process.env,LOCALAPPDATA:state,BHARATSHOP_MACHINE_UI_PORT:String(server.address().port)}}),error=>error.code===1&&/unverified process/.test(error.stderr));
  assert.equal(readFileSync(pidFile,'utf8'),String(process.pid));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(state,{recursive:true,force:true});}
});
