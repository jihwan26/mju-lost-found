/**
 * 알림 목록 / 읽음 처리 (pages/8_알림.py).
 */
import express from 'express';

import * as db from '../db.js';
import * as auth from '../auth.js';
import { intOrNull, wrap } from '../helpers.js';

const router = express.Router();

router.get('/notifications', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  const limit = intOrNull(req.query.limit) ?? 20;
  const offset = intOrNull(req.query.offset) ?? 0;

  // limit+1 을 요청해서 "다음 페이지가 있는지"를 별도 COUNT 없이 알아낸다.
  let items = db.listNotificationsByUser(user.id, limit + 1, offset);
  const hasMore = items.length > limit;
  if (hasMore) items = items.slice(0, limit);
  res.json({ items, hasMore, unreadCount: db.countUnreadNotifications(user.id) });
}));

/**
 * 알림 "확인". 읽음 처리 후, 어디로 이동해야 하는지를 프론트에 알려준다.
 * message 알림은 related_id(message id)를 그대로 믿지 않고 메시지를 다시 조회해
 * chat_room_id 를 알아낸다 -- 실제 접근 권한은 그 방을 열 때 다시 검증된다.
 */
router.post('/notifications/:id/read', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  const id = intOrNull(req.params.id);
  db.markNotificationAsRead(id, user.id);

  const n = db.getNotification(id);
  if (n?.type === 'message' && n.related_type === 'message' && n.related_id) {
    const message = db.getMessage(n.related_id);
    res.json(message
      ? { navigate: `/chats/${message.chat_room_id}` }
      : { navigate: null, warning: '관련 메시지를 찾을 수 없습니다. (삭제되었을 수 있어요)' });
    return;
  }
  if (n?.type === 'match' && n.related_type === 'match' && n.related_id) {
    res.json({ navigate: '/matches' });
    return;
  }
  // "찾으시던 물건이 올라왔어요" -- 아직 매칭이 아니라 습득 게시물을 가리킨다.
  if (n?.type === 'match' && n.related_type === 'found_post' && n.related_id) {
    res.json({ navigate: `/found/${n.related_id}` });
    return;
  }
  // 댓글 알림은 그 댓글이 달린 게시물로 보낸다.
  if (n?.type === 'comment' && n.related_type === 'comment' && n.related_id) {
    const target = db.getCommentTarget(n.related_id);
    res.json(target
      ? { navigate: `/${target.post_kind}/${target.post_id}` }
      : { navigate: null, warning: '관련 게시물을 찾을 수 없습니다. (삭제되었을 수 있어요)' });
    return;
  }
  // report_processed / post_deleted / message_hidden / user_suspended:
  // 이동할 전용 화면이 없으므로 읽음 처리만 하고 알림 목록에 남는다.
  res.json({ navigate: null });
}));

router.post('/notifications/read-all', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  res.json({ updated: db.markAllNotificationsAsRead(user.id) });
}));

export default router;
