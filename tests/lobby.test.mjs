import test from "node:test";
import assert from "node:assert/strict";
import { validateNickname, validateRoomId } from "../packages/shared/dist/index.js";
import { createLobbyWorld, addLobbyMember, removeLobbyMember } from "../packages/simulation/dist/index.js";
test("nickname and room ID validation", () => {
  assert.equal(validateNickname("  旅行者  "), "旅行者");
  assert.throws(() => validateNickname("<script>"));
  assert.throws(() => validateNickname("a"));
  assert.throws(() => validateNickname(undefined));
  assert.equal(validateRoomId("  abcd-1234 "), "abcd-1234");
  assert.throws(() => validateRoomId("../../secret"));
});
test("unique spawn positions and freed-slot reuse", () => {
  const world = createLobbyWorld();
  const a = addLobbyMember(world, "a", "Alice");
  const b = addLobbyMember(world, "b", "Bob");
  assert.notDeepEqual([a.x, a.y], [b.x, b.y]);
  assert.throws(() => addLobbyMember(world, "a", "Dup"));
  addLobbyMember(world, "c", "Charlie");
  addLobbyMember(world, "d", "David");
  assert.throws(() => addLobbyMember(world, "e", "Eve"));
  assert.equal(removeLobbyMember(world, "a"), true);
  const e = addLobbyMember(world, "e", "Eve");
  assert.deepEqual([a.x, a.y], [e.x, e.y]);
  assert.equal(removeLobbyMember(world, "missing"), false);
});
