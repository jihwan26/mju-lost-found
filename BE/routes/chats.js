/**
 * 채팅방 목록 / 개설 / 메시지 (pages/5_채팅.py, 6_내_채팅.py).
 *
 * 방은 두 종류다: 매칭에서 파생된 방(from-match)과 게시글에서 바로 시작한 방(direct).
 * 어느 쪽이든 참여자 판정은 db.getChatRoom 이 매번 다시 하므로,
 * 클라이언트가 보낸 방 id 를 여기서 신뢰하지 않는다.
 */
import express from 'express';

import * as db from '../db.js';
import * as auth from '../auth.js';
import { intOrNull, wrap } from '../helpers.js';
import { imageUrlFor, upload } from '../upload.js';

const router = express.Router();

router.get('/chats', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  res.json(db.listChatRoomsByUser(user.id));
}));

/** 매칭에서 채팅방 열기 (pages/4_내_매칭.py 의 "채팅하기"). */
router.post('/chats/from-match', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  const room = db.getOrCreateChatRoom(intOrNull(req.body?.matchId), user.id);
  res.json({ id: room.id });
}));

/** 게시글에서 작성자에게 바로 채팅 걸기 (Match 를 만들지 않는 경로). */
router.post('/chats/direct', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  const room = db.getOrCreateDirectChatRoom(req.body?.postKind, intOrNull(req.body?.postId), user.id);
  res.json({ id: room.id });
}));

/** 채팅방 헤더에 필요한 정보(상대 닉네임, 게시물 라벨, AI 점수). */
router.get('/chats/:id', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  res.json(db.getChatRoomView(intOrNull(req.params.id), user.id));
}));

/**
 * 메시지 목록. 원본과 같은 limit+1 lookahead 로 "이전 메시지가 더 있는지"를
 * 별도 COUNT 쿼리 없이 알아낸다.
 */
router.get('/chats/:id/messages', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  const roomId = intOrNull(req.params.id);
  const beforeId = intOrNull(req.query.before_id);

  let messages = db.listMessages(roomId, user.id, db.MESSAGE_PAGE_SIZE + 1, beforeId);
  const hasMore = messages.length > db.MESSAGE_PAGE_SIZE;
  if (hasMore) messages = messages.slice(-db.MESSAGE_PAGE_SIZE);
  res.json({ messages, hasMore });
}));

/**
 * 메시지 전송. 글만, 사진만, 둘 다 — 세 경우 모두 이 경로 하나로 받는다.
 * 사진을 보낼 때는 multipart 로 오고, 글만 보낼 때는 JSON 으로 온다
 * (multer 는 multipart 가 아니면 그냥 통과시키므로 둘 다 처리된다).
 */
router.post('/chats/:id/messages', upload.single('image'), wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  const message = db.sendMessage(
    intOrNull(req.params.id), user.id, req.body?.content, imageUrlFor(req.file)
  );
  res.status(201).json(message);
}));

/** 메시지 이모지 반응 토글. 같은 이모지를 다시 누르면 취소된다. */
router.post('/messages/:id/reactions', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  res.json(db.toggleMessageReaction(intOrNull(req.params.id), user.id, req.body?.emoji));
}));

/**
 * 읽음 처리. 채팅방을 실제로 보고 있을 때만 호출된다 (목록 화면에서는 호출하지 않음).
 * 상대방이 보낸 메시지만 대상이고, 같은 방의 'message' 알림도 함께 읽음 처리한다.
 */
router.post('/chats/:id/read', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  const roomId = intOrNull(req.params.id);
  const messages = db.markMessagesAsRead(roomId, user.id);
  const notifications = db.markMessageNotificationsAsReadForChatRoom(roomId, user.id);
  res.json({ messages, notifications });
}));

export default router;
