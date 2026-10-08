import test from 'node:test';
import assert from 'node:assert/strict';
import {ROUND_TARGETS,CHALLENGE_TARGETS} from '../build/rules.js';
test('ordinary goal curve has nine strictly increasing, calibrated thresholds',()=>{
 assert.deepEqual(ROUND_TARGETS,[280,420,540,650,760,880,1010,1150,1300]);
 assert.equal(ROUND_TARGETS.length,9);
 assert.ok(ROUND_TARGETS.every((value,i)=>i===0||value>ROUND_TARGETS[i-1]));
});
test('historical challenge goal curve remains available unchanged',()=>{
 assert.deepEqual(CHALLENGE_TARGETS,[280,440,650,950,1350,1900,2700,3800,5400]);
 assert.ok(ROUND_TARGETS.every((target,i)=>target<=CHALLENGE_TARGETS[i]));
});
