/**
 * 관리자 신고 처리 (pages/7_관리자.py).
 *
 * requireAdminUser 는 편의용 1차 방어선일 뿐이다. 실제 관리자 검증은
 * db.listReportsForAdmin / processReport / applyReportAction 안에서
 * 매번 DB의 is_admin 을 다시 읽어 이루어진다.
 */
import express from 'express';

import * as db from '../db.js';
import * as auth from '../auth.js';
import { filterValue, intOrNull, wrap } from '../helpers.js';

const router = express.Router();

/** 관리자 대시보드 지표. 전부 COUNT 라 가볍다. */
router.get('/admin/stats', wrap(async (req, res) => {
  const admin = auth.requireAdminUser(req, res);
  if (!admin) return;
  res.json(db.getAdminStats(admin.id));
}));

router.get('/admin/reports', wrap(async (req, res) => {
  const admin = auth.requireAdminUser(req, res);
  if (!admin) return;
  const limit = intOrNull(req.query.limit) ?? 20;
  const offset = intOrNull(req.query.offset) ?? 0;

  let items = db.listReportsForAdmin(admin.id, {
    status: filterValue(req.query.status),
    targetType: filterValue(req.query.targetType),
    limit: limit + 1,
    offset,
  });
  const hasMore = items.length > limit;
  if (hasMore) items = items.slice(0, limit);
  res.json({ items, hasMore });
}));

/** 반려(dismissed) 처리 -- 실제 제재 없이 결정만 기록한다. */
router.post('/admin/reports/:id/process', wrap(async (req, res) => {
  const admin = auth.requireAdminUser(req, res);
  if (!admin) return;
  db.processReport(intOrNull(req.params.id), admin.id, req.body?.status, req.body?.adminNote);
  res.json({ ok: true });
}));

/** 조치 완료 -- 신고 처리 + 실제 제재를 하나의 트랜잭션으로 적용한다. */
router.post('/admin/reports/:id/action', wrap(async (req, res) => {
  const admin = auth.requireAdminUser(req, res);
  if (!admin) return;
  const id = db.applyReportAction(intOrNull(req.params.id), admin.id, {
    actionType: req.body?.actionType,
    actionReason: req.body?.actionReason,
    adminNote: req.body?.adminNote,
    suspendDurationDays: req.body?.suspendDurationDays ?? null,
  });
  res.json({ id });
}));

export default router;
