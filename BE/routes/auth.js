/**
 * 로그인 / 로그아웃 / 내 정보 / 닉네임 설정.
 * (ui/auth.py + app.py 의 로그인 게이트에 해당)
 */
import express from 'express';
import crypto from 'node:crypto';

import * as db from '../db.js';
import * as auth from '../auth.js';
import { wrap } from '../helpers.js';

const router = express.Router();

/** 화면 상단/게이트에 필요한 현재 사용자 상태 묶음. */
router.get('/me', wrap(async (req, res) => {
  res.json(auth.buildMeResponse(req));
}));

router.get('/auth/google', wrap(async (req, res) => {
  if (!auth.isAuthConfigured()) {
    res.status(503).json({ error: 'Google 로그인이 설정되지 않았습니다. 환경변수를 확인해주세요.' });
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  res.redirect(auth.buildGoogleAuthUrl(req, state));
}));

router.get('/auth/callback', wrap(async (req, res) => {
  const { code, state } = req.query;
  // state 불일치는 CSRF 신호다 -- 로그인시키지 않고 홈으로 되돌린다.
  if (!code || !state || state !== req.session.oauthState) {
    res.redirect('/?login_error=' + encodeURIComponent('로그인 요청이 유효하지 않습니다. 다시 시도해주세요.'));
    return;
  }
  req.session.oauthState = null;

  let profile;
  try {
    profile = await auth.exchangeCodeForProfile(req, code);
  } catch (e) {
    console.error('[auth] 토큰 교환 실패', e);
    res.redirect('/?login_error=' + encodeURIComponent('Google 로그인에 실패했습니다.'));
    return;
  }

  if (!profile.email) {
    res.redirect('/?login_error=' + encodeURIComponent('Google 계정에서 이메일을 가져오지 못했습니다.'));
    return;
  }

  // 도메인이 아니어도 일단 로그인은 시킨다. 그래야 화면에서 "명지대 계정만
  // 이용할 수 있습니다 + 현재 계정: xxx" 안내를 띄울 수 있다 (원본과 같은 UX).
  req.session.userId = db.resolveUserId(profile.email, profile.name);
  res.redirect('/');
}));

/** 개발 전용 로그인. 배포에서는 auth.isDevLoginEnabled() 가 false 라 404 로 막힌다. */
router.post('/auth/dev-login', wrap(async (req, res) => {
  if (!auth.isDevLoginEnabled()) {
    res.status(404).json({ error: '사용할 수 없는 기능입니다.' });
    return;
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) throw new db.ValidationError('이메일을 입력해주세요.');
  req.session.userId = db.resolveUserId(email, String(req.body?.name || '').trim());
  res.json(auth.buildMeResponse(req));
}));

router.post('/auth/logout', wrap(async (req, res) => {
  req.session = null;
  res.json({ ok: true });
}));

/**
 * 고정 닉네임 설정 (한 번만 가능).
 * 아직 닉네임이 없는 상태에서 부르는 API라 requireReadyUser 를 쓸 수 없다
 * -- 그 가드가 "닉네임 있음"까지 요구하기 때문. 로그인 + 도메인만 직접 확인한다.
 */
router.post('/me/nickname', wrap(async (req, res) => {
  const user = auth.currentUser(req);
  if (!user) throw Object.assign(new Error('로그인이 필요합니다.'), { status: 401 });
  if (!auth.isAllowedDomain(user.email)) {
    throw Object.assign(new Error('명지대학교 계정(@mju.ac.kr)만 이용할 수 있습니다.'), { status: 403 });
  }
  db.setInitialNickname(user.id, req.body?.nickname);
  res.json(auth.buildMeResponse(req));
}));

/**
 * 닉네임 변경(최초 설정 이후). 30일에 한 번만 가능하며, 남은 일수 계산과
 * 실제 변경 모두 db 계층이 판단한다.
 */
router.patch('/me/nickname', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  db.changeNickname(user.id, req.body?.nickname);
  res.json(auth.buildMeResponse(req));
}));

/** 주로 쓰는 캠퍼스 변경. 게시판 탭·등록 폼의 기본값으로만 쓰인다. */
router.patch('/me/campus', wrap(async (req, res) => {
  const user = auth.requireReadyUser(req, res);
  if (!user) return;
  db.setUserCampus(user.id, req.body?.campus);
  res.json(auth.buildMeResponse(req));
}));

export default router;
