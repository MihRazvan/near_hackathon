import test from 'node:test';
import assert from 'node:assert/strict';
import {pushEditorHistory,restoreEditorHistory,editorHistoryState} from '../src/integration/editor-history.mjs';
test('delete-all can be undone, redone and branched without moving the current server version or sharing wallet histories',()=>{
 const a={id:'vehicle',version:1,spots:[{id:'door'}]},empty={...a,version:2,spots:[]};
 pushEditorHistory('owner.near',a);let restored=restoreEditorHistory('owner.near',empty,'undo');assert.deepEqual(restored.spots,a.spots);assert.equal(restored.version,2);
 assert.equal(editorHistoryState('other.near','vehicle').undo,false);
 const redone=restoreEditorHistory('owner.near',restored,'redo');assert.deepEqual(redone.spots,[]);
 restored=restoreEditorHistory('owner.near',redone,'undo');pushEditorHistory('owner.near',restored);assert.equal(editorHistoryState('owner.near','vehicle').redo,false);
 assert.equal(a.spots.length,1);
});
