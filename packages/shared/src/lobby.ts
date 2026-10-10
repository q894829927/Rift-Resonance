export const MAX_NICKNAME_LENGTH = 16;
export function validateNickname(value: unknown): string {
  if (typeof value !== "string") throw new Error("昵称必须是字符串");
  const name = value.trim();
  if (name.length < 2 || name.length > MAX_NICKNAME_LENGTH ||
      /[\u0000-\u001f\u007f<>]/u.test(name)) {
    throw new Error("昵称须为 2～16 个字符，不能包含控制字符或尖括号");
  }
  return name;
}
export function validateRoomId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{4,64}$/.test(value.trim())) {
    throw new Error("请输入有效的房间 ID");
  }
  return value.trim();
}
