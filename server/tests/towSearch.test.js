import assert from 'node:assert/strict';
import test from 'node:test';
import '../db/migrate.js';
import { createTow, deleteTow, listTows, listTowsPage } from '../services/tows.js';

test('unified search matches tow details literally and keeps status and pagination consistent', () => {
  const suffix = `search-${Date.now()}`;
  const active = createTow({airline:'MX',inboundFlightNumber:'9876',tailNumber:`N${suffix}`,aircraftType:'A220',gate:'Gate 77',towSpot:'NL614',driver:'Driver 100%_Ready',leftWingWalker:'Test Left',rightWingWalker:'Test Right',otherTeamMembers:'Support Team',status:'tow_started'});
  const history = Array.from({length:12},(_,index)=>createTow({airline:'MX',inboundFlightNumber:'9876',tailNumber:`N${suffix}-${index}`,aircraftType:'A220',gate:'Gate 77',towSpot:'NL614',driver:'Driver 100%_Ready',leftWingWalker:'Test Left',rightWingWalker:'Test Right',otherTeamMembers:'Support Team',status:'completed',towCompletedAt:'2026-10-07T02:00:00Z'}));
  try {
    for (const search of ['mx9876','a220','gate 77','nl614','driver','test left','test right','support team','100%_ready']) {
      assert.ok(listTows({status:'active',search}).some(tow=>tow.id===active.id),search);
      const matches = listTows({status:'completed',search,tailNumber:suffix});
      assert.equal(matches.length,12,search);
      const page = listTowsPage({status:'completed',search,tailNumber:suffix},3,5);
      assert.equal(page.total,12); assert.equal(page.tows.length,2);
    }
    assert.equal(listTows({status:'completed',search:'10/6/26',tailNumber:suffix}).length,12);
    assert.equal(listTows({status:'completed',search:"' OR 1=1 --",tailNumber:suffix}).length,0);
    assert.equal(listTows({status:'completed',search:'   ',tailNumber:suffix}).length,12);
    assert.equal(listTowsPage({status:'completed',search:'no matching tail',tailNumber:suffix},3,5).page,1);
    assert.ok(listTows({status:'active',search:'tow started'}).some(tow=>tow.id===active.id));
    assert.equal(listTows({status:'completed',search:suffix}).some(tow=>tow.id===active.id),false);
  } finally { for (const tow of [active,...history]) deleteTow(tow.id); }
});
